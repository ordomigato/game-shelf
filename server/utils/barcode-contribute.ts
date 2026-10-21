import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import type {
  BarcodeSuggestion,
  SuggestionResult,
} from '../../shared/types/barcode'
import { barcodeLookups, games, platforms, userBarcodes } from '../db/schema'
import { log } from './log'
import { submitToScanDex } from './scandex'

/** The most picks one send request carries. */
export const MAX_SENDS = 20

/**
 * The most picks one listing returns. Only a safety cap: a person's unsent
 * picks are expected to number in the low hundreds at most.
 */
export const MAX_LISTED = 1000

interface Eligible extends BarcodeSuggestion {
  platformId: number
}

/**
 * The signed-in user, only if their account may share barcodes with ScanDex
 * (`users.contributes_barcodes`, set by hand). Anyone else gets a 404, so the
 * feature doesn't show itself to them.
 */
export async function requireContributor(event: H3Event) {
  const { sub } = await requireAuth(event)
  const user = await findOrCreateUser(sub)
  if (!user.contributesBarcodes) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return user
}

/**
 * The user's own picks that ScanDex could be told about, newest first.
 * Decided here and not by the browser. A pick is eligible when:
 * - it has a platform (ScanDex needs one),
 * - our shared cache says ScanDex had no game for the code, so a Change on a
 *   ScanDex match is never eligible,
 * - and it hasn't been sent (`submitted_at` is null).
 * The game and platform names come from our catalog. With `codes` (a send)
 * the list is narrowed to those barcodes and holds at most 20. Without them
 * (a listing) it holds up to 1,000. One statement either way.
 */
async function findEligible(
  ownerId: string,
  codes?: string[],
): Promise<Eligible[]> {
  if (codes && !codes.length) return []
  const rows = await useDb()
    .select({
      code: userBarcodes.code,
      igdbId: userBarcodes.igdbId,
      name: games.name,
      coverId: games.coverId,
      platformId: platforms.igdbId,
      platform: platforms.name,
    })
    .from(userBarcodes)
    .innerJoin(barcodeLookups, eq(barcodeLookups.code, userBarcodes.code))
    .innerJoin(games, eq(games.igdbId, userBarcodes.igdbId))
    .innerJoin(platforms, eq(platforms.igdbId, userBarcodes.platformId))
    .where(
      and(
        eq(userBarcodes.ownerId, ownerId),
        isNull(userBarcodes.submittedAt),
        isNull(barcodeLookups.igdbId),
        codes ? inArray(userBarcodes.code, codes) : undefined,
      ),
    )
    .orderBy(desc(userBarcodes.updatedAt))
    .limit(codes ? MAX_SENDS : MAX_LISTED)
  return rows
}

/** Every pick the user could share, for them to choose from. */
export async function listSuggestions(
  ownerId: string,
): Promise<BarcodeSuggestion[]> {
  const rows = await findEligible(ownerId)
  return rows.map(({ code, igdbId, name, coverId, platform }) => ({
    code,
    igdbId,
    name,
    coverId,
    platform,
  }))
}

const failed = (
  code: string,
  status = 0,
  message: string | null = null,
): SuggestionResult => ({ code, result: 'failed', status, message })

/**
 * Sends the chosen picks (at most 20) to ScanDex and says how each went. Only
 * the barcode and the IGDB game and platform go, never anything about the
 * user. Eligibility is checked again here (see `findEligible`), and a code
 * that isn't eligible comes back as failed with status 0. `submitted_at` is
 * claimed in one statement before sending, so two requests never send the
 * same code, and given back for a code whose send failed so it can be
 * listed and sent again. Everything finishes before this returns (each call
 * to ScanDex has its own timeout), so no claim is left behind. Never throws:
 * a failure is logged (never with the database's error, which carries the
 * barcodes) and shows as failed.
 */
export async function sendSuggestions(
  ownerId: string,
  codes: string[],
): Promise<SuggestionResult[]> {
  const wanted = [...new Set(codes)].slice(0, MAX_SENDS)
  const results = new Map<string, SuggestionResult>()
  const claimed = new Set<string>()
  try {
    await send(ownerId, wanted, claimed, results)
  } catch (error) {
    logFailure(error)
  }
  const release = [...claimed].filter(
    (code) => results.get(code)?.result !== 'sent',
  )
  if (release.length) {
    try {
      await useDb()
        .update(userBarcodes)
        .set({ submittedAt: null })
        .where(
          and(
            eq(userBarcodes.ownerId, ownerId),
            inArray(userBarcodes.code, release),
          ),
        )
    } catch (error) {
      logFailure(error)
    }
  }
  return wanted.map((code) => results.get(code) ?? failed(code))
}

function logFailure(error: unknown) {
  log('warn', 'barcode.suggest_failed', {
    status: -1,
    error: error instanceof Error ? error.name : 'unknown',
  })
}

async function send(
  ownerId: string,
  codes: string[],
  claimed: Set<string>,
  results: Map<string, SuggestionResult>,
): Promise<void> {
  const candidates = await findEligible(ownerId, codes)
  if (!candidates.length) return

  const won = await useDb()
    .update(userBarcodes)
    .set({ submittedAt: new Date() })
    .where(
      and(
        eq(userBarcodes.ownerId, ownerId),
        inArray(
          userBarcodes.code,
          candidates.map((pick) => pick.code),
        ),
        isNull(userBarcodes.submittedAt),
      ),
    )
    .returning({ code: userBarcodes.code })
  for (const row of won) claimed.add(row.code)

  await Promise.all(
    candidates
      .filter((pick) => claimed.has(pick.code))
      .map(async (pick) => {
        const outcome = await submitToScanDex({
          igdbId: pick.igdbId,
          platformId: pick.platformId,
          platform: pick.platform,
          name: pick.name,
          code: pick.code,
        })
        results.set(
          pick.code,
          outcome.ok
            ? { code: pick.code, result: 'sent' }
            : failed(pick.code, outcome.status, outcome.message),
        )
      }),
  )
}
