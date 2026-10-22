import { and, eq, or, sql } from 'drizzle-orm'
import { barcodeCacheFresh } from '../../shared/utils/barcode'
import type { BarcodeMatch, BarcodeResult } from '../../shared/types/barcode'
import { barcodeLookups, libraryItems } from '../db/schema'
import { ensureCatalogGames } from './catalog'
import { platformNames } from './collections'
import { log } from './log'
import { askScanDex, ScanDexError, type ScanDexAnswer } from './scandex'

type LookupRow = typeof barcodeLookups.$inferSelect

type Match = Extract<ScanDexAnswer, { kind: 'match' }>

function toAnswer(row: LookupRow): ScanDexAnswer {
  return row.igdbId === null
    ? { kind: 'none' }
    : {
        kind: 'match',
        igdbId: row.igdbId,
        platformId: row.platformId,
        platformName: row.platformName,
      }
}

const toMatch = (row: LookupRow): Match => ({
  kind: 'match',
  igdbId: row.igdbId!,
  platformId: row.platformId,
  platformName: null,
})

/**
 * The picks that can serve this user for a barcode: their own (pending or
 * approved) and the approved one for everyone. Only these two ever leave the
 * database for a user, and the rule is applied again on what comes back, so
 * a pending pick of someone else or a rejected one never serves anyone.
 */
export async function findPicks(
  ownerId: string,
  code: string,
): Promise<{ own: Match | null; approved: Match | null }> {
  const rows = await useDb()
    .select()
    .from(barcodeLookups)
    .where(
      and(
        eq(barcodeLookups.code, code),
        eq(barcodeLookups.source, 'user'),
        or(
          eq(barcodeLookups.status, 'approved'),
          and(
            eq(barcodeLookups.status, 'pending'),
            eq(barcodeLookups.submittedBy, ownerId),
          ),
        ),
      ),
    )
  const usable = rows.filter(
    (row) =>
      row.source === 'user' &&
      row.code === code &&
      row.igdbId !== null &&
      (row.status === 'approved' ||
        (row.status === 'pending' && row.submittedBy === ownerId)),
  )
  const own = usable.find((row) => row.submittedBy === ownerId)
  const approved = usable.find((row) => row.status === 'approved')
  return {
    own: own ? toMatch(own) : null,
    approved: approved ? toMatch(approved) : null,
  }
}

/**
 * What ScanDex says about a normalised barcode: from our cache while it is
 * fresh, else from ScanDex (and kept for next time). `beforeScanDex` runs
 * just before a real ScanDex call, so a cap on those can refuse it. If
 * ScanDex fails and we hold an older answer, that one is used. Otherwise
 * the failure is thrown as a 502. A cached answer is also used when the
 * cap refuses the call. Logs the outcome and ScanDex's time, never
 * the barcode.
 */
export async function lookupBarcode(
  code: string,
  beforeScanDex: () => Promise<void> = async () => {},
  /** The digits as scanned, which ScanDex is asked with first. */
  scanned: string = code,
): Promise<ScanDexAnswer> {
  const db = useDb()
  const [cached] = await db
    .select()
    .from(barcodeLookups)
    .where(
      and(eq(barcodeLookups.code, code), eq(barcodeLookups.source, 'scandex')),
    )
  if (
    cached &&
    barcodeCacheFresh(
      { igdbId: cached.igdbId, fetchedAt: cached.fetchedAt ?? new Date(0) },
      new Date(),
    )
  ) {
    log('info', 'barcode.lookup', { outcome: 'cache_hit' })
    return toAnswer(cached)
  }
  try {
    await beforeScanDex()
  } catch (error) {
    // At a cap, a barcode we already know is still answered.
    if (cached) {
      log('info', 'barcode.lookup', { outcome: 'cache_stale_at_cap' })
      return toAnswer(cached)
    }
    throw error
  }
  const started = performance.now()
  try {
    const answer = await askScanDex(scanned)
    const scandexMs = Math.round(performance.now() - started)
    log('info', 'barcode.lookup', {
      outcome: answer.kind === 'match' ? 'scandex_match' : 'scandex_no_match',
      scandexMs,
    })
    const values = {
      igdbId: answer.kind === 'match' ? answer.igdbId : null,
      platformId: answer.kind === 'match' ? answer.platformId : null,
      platformName: answer.kind === 'match' ? answer.platformName : null,
      fetchedAt: new Date(),
    }
    try {
      await db
        .insert(barcodeLookups)
        .values({ code, source: 'scandex', ...values })
        .onConflictDoUpdate({
          target: barcodeLookups.code,
          targetWhere: sql`${barcodeLookups.source} = 'scandex'`,
          set: values,
        })
    } catch {
      // Not keeping the answer only costs a later lookup.
      log('warn', 'barcode.cache_failed')
    }
    return answer
  } catch (error) {
    if (!(error instanceof ScanDexError)) throw error
    const scandexMs = Math.round(performance.now() - started)
    log('warn', 'barcode.lookup', {
      outcome: cached ? 'error_stale_used' : 'error',
      scandexMs,
    })
    if (cached) return toAnswer(cached)
    throw createError({ statusCode: 502, statusMessage: 'Lookup failed' })
  }
}

/**
 * The game a ScanDex match stands for, from the shared catalog (read from
 * IGDB if it isn't there yet), with where the user has it. Null when IGDB
 * doesn't know the game.
 */
export async function describeMatch(
  ownerId: string,
  answer: Match,
): Promise<BarcodeMatch | null> {
  const [game] = await ensureCatalogGames([answer.igdbId])
  if (!game) return null
  const [[item], names] = await Promise.all([
    useDb()
      .select({
        owned: libraryItems.owned,
        wishlisted: libraryItems.wishlisted,
        ownedOn: libraryItems.ownedOn,
        wantedOn: libraryItems.wantedOn,
      })
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.ownerId, ownerId),
          eq(libraryItems.igdbId, game.igdbId),
        ),
      ),
    answer.platformId === null
      ? new Map<number, string>()
      : platformNames([answer.platformId]),
  ])
  const platformName = answer.platformId
    ? (names.get(answer.platformId) ?? answer.platformName)
    : null
  return {
    igdbId: game.igdbId,
    name: game.name,
    coverId: game.coverId,
    releaseDate: game.releaseDate,
    platform:
      answer.platformId !== null && platformName
        ? { id: answer.platformId, name: platformName }
        : null,
    owned: item?.owned ?? false,
    wishlisted: item?.wishlisted ?? false,
    ownedOn: item?.ownedOn ?? [],
    wantedOn: item?.wantedOn ?? [],
  }
}

/**
 * What a barcode stands for for this user, first found wins:
 * 1. their own pick (pending or approved, never rejected),
 * 2. the approved pick for the barcode, which serves everyone,
 * 3. our copy of ScanDex's answer while it is fresh,
 * 4. ScanDex itself.
 * Steps 1 and 2 cost no ScanDex call and aren't counted by `beforeScanDex`.
 * A pick whose game IGDB no longer knows is skipped.
 */
export async function resolveBarcode(
  ownerId: string,
  barcode: { code: string; scanned: string },
  beforeScanDex: () => Promise<void>,
): Promise<BarcodeResult> {
  let picks: Awaited<ReturnType<typeof findPicks>> = {
    own: null,
    approved: null,
  }
  try {
    picks = await findPicks(ownerId, barcode.code)
  } catch {
    // ScanDex's answer can still serve.
    log('warn', 'barcode.picks_failed')
  }
  for (const [pick, own] of [
    [picks.own, true],
    [picks.approved, false],
  ] as const) {
    if (!pick) continue
    try {
      const match = await describeMatch(ownerId, pick)
      if (match) return own ? { match, own: true } : { match }
    } catch {
      // IGDB or the catalog failed: the next step can still answer.
      log('warn', 'barcode.own_pick_failed')
    }
  }
  const answer = await lookupBarcode(
    barcode.code,
    beforeScanDex,
    barcode.scanned,
  )
  if (answer.kind === 'none') return { match: null }
  return { match: await describeMatch(ownerId, answer) }
}
