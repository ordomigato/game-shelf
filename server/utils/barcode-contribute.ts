import { and, eq, inArray, isNull } from 'drizzle-orm'
import { barcodeLookups, platforms, userBarcodes } from '../db/schema'
import { log } from './log'
import { submitToScanDex } from './scandex'

interface Pick {
  code: string
  igdbId: number
  platformId: number | null
}

/** The most suggestions one request sends. */
const MAX_SENDS = 20
/** How long the whole call may take, reading the database included. */
const TOTAL_MS = 3000

/**
 * Suggests the games a user matched to boxes ScanDex didn't know, so its
 * database can grow. Only the barcode and the IGDB game and platform go,
 * never anything about the user. A pick is sent when:
 * - it has a platform (ScanDex needs one),
 * - our shared cache says ScanDex had no game for the code (decided here,
 *   not by the browser, so a Change on a ScanDex match is never sent),
 * - and it hasn't been sent before. `submitted_at` is claimed in one
 *   statement before sending, so two requests never send the same code, and
 *   given back for a code whose send failed so a later add can try again.
 * At most 20 are sent, and the whole call gives up after 3 seconds. The game
 * and platform names come from our catalog. The caller decides whether the
 * account may contribute. Never throws: a failure is logged (never with the
 * database's error, which carries the barcodes) and the add that called this
 * is unaffected.
 */
export async function contributePicks(
  ownerId: string,
  picks: Pick[],
  gameNames: Map<number, string>,
): Promise<void> {
  const withPlatform = picks.filter((pick) => pick.platformId !== null)
  if (!withPlatform.length) return
  const claimed = new Set<string>()
  const sent = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), TOTAL_MS)
  })
  try {
    const outcome = await Promise.race([
      send(ownerId, withPlatform, gameNames, claimed, sent),
      deadline,
    ])
    if (outcome === 'late')
      log('warn', 'barcode.suggest_failed', { status: -2 })
  } catch (error) {
    log('warn', 'barcode.suggest_failed', {
      status: -1,
      error: error instanceof Error ? error.name : 'unknown',
    })
  } finally {
    clearTimeout(timer)
  }
  const failed = [...claimed].filter((code) => !sent.has(code))
  if (!failed.length) return
  try {
    await useDb()
      .update(userBarcodes)
      .set({ submittedAt: null })
      .where(
        and(
          eq(userBarcodes.ownerId, ownerId),
          inArray(userBarcodes.code, failed),
        ),
      )
  } catch (error) {
    log('warn', 'barcode.suggest_failed', {
      status: -1,
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
}

async function send(
  ownerId: string,
  picks: Pick[],
  gameNames: Map<number, string>,
  claimed: Set<string>,
  sent: Set<string>,
): Promise<void> {
  const db = useDb()
  const codes = picks.map((pick) => pick.code)
  const [unknown, platformRows] = await Promise.all([
    db
      .select({ code: barcodeLookups.code })
      .from(barcodeLookups)
      .where(
        and(inArray(barcodeLookups.code, codes), isNull(barcodeLookups.igdbId)),
      ),
    db
      .select({ id: platforms.igdbId, name: platforms.name })
      .from(platforms)
      .where(
        inArray(
          platforms.igdbId,
          picks.map((pick) => pick.platformId!),
        ),
      ),
  ])
  const noMatch = new Set(unknown.map((row) => row.code))
  const platformNames = new Map(platformRows.map((row) => [row.id, row.name]))
  const candidates = picks
    .filter(
      (pick) =>
        noMatch.has(pick.code) &&
        gameNames.has(pick.igdbId) &&
        platformNames.has(pick.platformId!),
    )
    .slice(0, MAX_SENDS)
  if (!candidates.length) return

  const won = await db
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
        const ok = await submitToScanDex({
          igdbId: pick.igdbId,
          platformId: pick.platformId!,
          platform: platformNames.get(pick.platformId!)!,
          name: gameNames.get(pick.igdbId)!,
          value: Number(pick.code),
        })
        if (ok) sent.add(pick.code)
      }),
  )
}
