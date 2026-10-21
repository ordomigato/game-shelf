import { and, eq } from 'drizzle-orm'
import { barcodeCacheFresh } from '../../shared/utils/barcode'
import type { BarcodeMatch } from '../../shared/types/barcode'
import { barcodeLookups, libraryItems } from '../db/schema'
import { ensureCatalogGames } from './catalog'
import { platformNames } from './collections'
import { log } from './log'
import { askScanDex, ScanDexError, type ScanDexAnswer } from './scandex'

type CacheRow = typeof barcodeLookups.$inferSelect

function toAnswer(row: CacheRow): ScanDexAnswer {
  return row.igdbId === null
    ? { kind: 'none' }
    : {
        kind: 'match',
        igdbId: row.igdbId,
        platformId: row.platformId,
        platformName: row.platformName,
      }
}

/**
 * What ScanDex says about a normalised barcode: from our cache while it is
 * fresh, else from ScanDex (and kept for next time). `beforeScanDex` runs
 * just before a real ScanDex call, so a cap on those can refuse it. If
 * ScanDex fails and we hold an older answer, that one is used. Otherwise
 * the failure is thrown as a 502. Logs the outcome and ScanDex's time, never
 * the barcode.
 */
export async function lookupBarcode(
  code: string,
  beforeScanDex: () => Promise<void> = async () => {},
): Promise<ScanDexAnswer> {
  const db = useDb()
  const [cached] = await db
    .select()
    .from(barcodeLookups)
    .where(eq(barcodeLookups.code, code))
  if (cached && barcodeCacheFresh(cached, new Date())) {
    log('info', 'barcode.lookup', { outcome: 'cache_hit' })
    return toAnswer(cached)
  }
  await beforeScanDex()
  const started = performance.now()
  try {
    const answer = await askScanDex(code)
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
    await db
      .insert(barcodeLookups)
      .values({ code, ...values })
      .onConflictDoUpdate({ target: barcodeLookups.code, set: values })
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
  answer: Extract<ScanDexAnswer, { kind: 'match' }>,
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
