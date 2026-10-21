import { and, eq, inArray, isNull } from 'drizzle-orm'
import { barcodeLookups, platforms, userBarcodes } from '../db/schema'
import { log } from './log'
import { submitToScanDex } from './scandex'

interface Pick {
  code: string
  igdbId: number
  platformId: number | null
}

/**
 * Suggests the games a user matched to boxes ScanDex didn't know, so its
 * database can grow. Only the barcode and the IGDB game and platform go,
 * never anything about the user. A pick is sent when:
 * - it has a platform (ScanDex needs one),
 * - our shared cache says ScanDex had no game for the code (decided here,
 *   not by the browser, so a Change on a ScanDex match is never sent),
 * - and it hasn't been sent before (`submitted_at` is set on success, and a
 *   failure leaves it empty so a later add can try again).
 * The game and platform names come from our catalog. The caller decides
 * whether the account may contribute. Never throws: a failure is logged and
 * the add that called this is unaffected.
 */
export async function contributePicks(
  ownerId: string,
  picks: Pick[],
  gameNames: Map<number, string>,
): Promise<void> {
  const withPlatform = picks.filter((pick) => pick.platformId !== null)
  if (!withPlatform.length) return
  try {
    const db = useDb()
    const codes = withPlatform.map((pick) => pick.code)
    const [unsent, unknown, platformRows] = await Promise.all([
      db
        .select({ code: userBarcodes.code })
        .from(userBarcodes)
        .where(
          and(
            eq(userBarcodes.ownerId, ownerId),
            inArray(userBarcodes.code, codes),
            isNull(userBarcodes.submittedAt),
          ),
        ),
      db
        .select({ code: barcodeLookups.code })
        .from(barcodeLookups)
        .where(
          and(
            inArray(barcodeLookups.code, codes),
            isNull(barcodeLookups.igdbId),
          ),
        ),
      db
        .select({ id: platforms.igdbId, name: platforms.name })
        .from(platforms)
        .where(
          inArray(
            platforms.igdbId,
            withPlatform.map((pick) => pick.platformId!),
          ),
        ),
    ])
    const sendable = new Set(unsent.map((row) => row.code))
    const noMatch = new Set(unknown.map((row) => row.code))
    const platformNames = new Map(platformRows.map((row) => [row.id, row.name]))

    const sent = await Promise.all(
      withPlatform
        .filter((pick) => sendable.has(pick.code) && noMatch.has(pick.code))
        .map(async (pick) => {
          const name = gameNames.get(pick.igdbId)
          const platform = platformNames.get(pick.platformId!)
          if (!name || !platform) return null
          const ok = await submitToScanDex({
            igdbId: pick.igdbId,
            platformId: pick.platformId!,
            platform,
            name,
            value: Number(pick.code),
          })
          return ok ? pick.code : null
        }),
    )
    const done = sent.filter((code): code is string => code !== null)
    if (!done.length) return
    await db
      .update(userBarcodes)
      .set({ submittedAt: new Date() })
      .where(
        and(
          eq(userBarcodes.ownerId, ownerId),
          inArray(userBarcodes.code, done),
        ),
      )
  } catch (error) {
    log('warn', 'barcode.suggest_failed', { status: -1 })
    console.error(error)
  }
}
