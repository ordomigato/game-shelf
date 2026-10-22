import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { ListName } from '../../shared/types/collection'
import type { BulkAddEntry, BulkAddResult } from '../../shared/types/barcode'
import {
  BULK_NO_ROOM,
  dedupeEntries,
  planBulkAdd,
} from '../../shared/utils/bulk-add'
import type { ListState } from '../../shared/utils/lists'
import type { PlanLimits } from '../../shared/utils/plans'
import { MAX_PENDING_PICKS, normalizeBarcode } from '../../shared/utils/barcode'
import { barcodeLookups, collectionItems, libraryItems } from '../db/schema'
import { ensureCatalogGames } from './catalog'
import { assertOwnsCollections, lastPositions } from './collections'

/** 403 saying how many more games fit, for the browser to show. */
function noRoomFor(where: keyof typeof BULK_NO_ROOM, fit: number): never {
  throw createError({
    statusCode: 403,
    statusMessage: 'Plan limit reached',
    data: { key: BULK_NO_ROOM[where].key, params: { fit: Math.max(0, fit) } },
  })
}

/**
 * The barcodes the user matched themselves, for games that end up in the
 * library (added, or already there). Unknown games leave no trace, and a
 * ScanDex match is never kept as a pick. The platform is kept only
 * if the catalog lists it for the game, as the add does. For a barcode named
 * twice in a batch, the last pick wins.
 */
function ownPicks(
  entries: BulkAddEntry[],
  present: Set<number>,
  catalog: Map<number, { platformIds: number[] }>,
) {
  const byCode = new Map<
    string,
    { code: string; igdbId: number; platformId: number | null }
  >()
  for (const entry of entries) {
    if (!entry.own || !entry.barcode || !present.has(entry.igdbId)) continue
    const code = normalizeBarcode(entry.barcode)
    if (!code) continue
    const known =
      entry.platformId !== null &&
      catalog.get(entry.igdbId)?.platformIds.includes(entry.platformId)
    byCode.set(code, {
      code,
      igdbId: entry.igdbId,
      platformId: known ? entry.platformId : null,
    })
  }
  return [...byCode.values()]
}

/**
 * Pending picks are capped per user (`MAX_PENDING_PICKS`), since picks are
 * keyed by barcode and a library of games doesn't bound them. A pick that
 * would add a pending one (a barcode they have no pick for yet, or one
 * rejected that now names another game) is left out once the user is at the
 * cap. Changing a pick that is already pending, or approved, takes no room.
 * A rejected pick naming the same game and platform again is left alone: it
 * stays rejected and isn't sent for review again.
 */
async function withRoomForPicks<
  T extends { code: string; igdbId: number; platformId: number | null },
>(ownerId: string, picks: T[]): Promise<T[]> {
  if (!picks.length) return picks
  const db = useDb()
  const [stored, [pending]] = await Promise.all([
    db
      .select({
        code: barcodeLookups.code,
        igdbId: barcodeLookups.igdbId,
        platformId: barcodeLookups.platformId,
        status: barcodeLookups.status,
      })
      .from(barcodeLookups)
      .where(
        and(
          eq(barcodeLookups.source, 'user'),
          eq(barcodeLookups.submittedBy, ownerId),
          inArray(
            barcodeLookups.code,
            picks.map((pick) => pick.code),
          ),
        ),
      ),
    db
      .select({ n: count() })
      .from(barcodeLookups)
      .where(
        and(
          eq(barcodeLookups.source, 'user'),
          eq(barcodeLookups.submittedBy, ownerId),
          eq(barcodeLookups.status, 'pending'),
        ),
      ),
  ])
  const known = new Map(stored.map((row) => [row.code, row]))
  let room = Math.max(0, MAX_PENDING_PICKS - (pending?.n ?? 0))
  return picks.filter((pick) => {
    const row = known.get(pick.code)
    if (row?.status === 'pending' || row?.status === 'approved') return true
    if (
      row?.status === 'rejected' &&
      row.igdbId === pick.igdbId &&
      row.platformId === pick.platformId
    ) {
      return false
    }
    if (room <= 0) return false
    room -= 1
    return true
  })
}

/**
 * Puts many IGDB games on Owned or the Wishlist (and into one of the user's
 * collections) at once, with the rules of adding them one by one (see
 * `planBulkAdd`). The games are read in a few queries and written in one
 * transaction: a single upsert for the library and a single insert for the
 * collection. If the plan's library or the collection can't take all the
 * new games, nothing is added and the refusal says how many fit. A
 * collection that isn't the user's is a 404.
 */
export async function bulkAdd(
  ownerId: string,
  limits: PlanLimits,
  input: {
    list: ListName
    collectionId?: string
    entries: BulkAddEntry[]
  },
): Promise<BulkAddResult> {
  const db = useDb()
  // `rememberOnly` entries only carry a barcode and are never added.
  const entries = dedupeEntries(
    input.entries.filter((entry) => !entry.rememberOnly),
  )
  const igdbIds = [
    ...new Set([
      ...entries.map((entry) => entry.igdbId),
      ...input.entries.map((entry) => entry.igdbId),
    ]),
  ]
  const addIds = new Set(entries.map((entry) => entry.igdbId))
  if (input.collectionId) {
    await assertOwnsCollections(ownerId, [input.collectionId])
  }

  const existingRows = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.ownerId, ownerId),
        inArray(libraryItems.igdbId, igdbIds),
      ),
    )
  // The catalog (and so IGDB) is asked about the games being added, and about
  // remember-only games only if they are already in the library. A request
  // can't make us fetch arbitrary games just to remember a barcode.
  const inLibraryNow = new Set(existingRows.map((row) => row.igdbId!))
  const catalogRows = await ensureCatalogGames(
    igdbIds.filter((id) => addIds.has(id) || inLibraryNow.has(id)),
  )
  const catalog = new Map(catalogRows.map((game) => [game.igdbId, game]))
  const existing = new Map<number, ListState>(
    existingRows.map((row) => [row.igdbId!, row]),
  )
  const plan = planBulkAdd(input.list, entries, existing, catalog)

  const newGames = plan.writes.filter((write) => write.isNew).length
  if (newGames) {
    const [row] = await db
      .select({ n: count() })
      .from(libraryItems)
      .where(eq(libraryItems.ownerId, ownerId))
    const used = row?.n ?? 0
    if (used + newGames > limits.games) {
      noRoomFor('library', limits.games - used)
    }
  }

  // Games already in the collection take no room.
  const itemIdOf = new Map(existingRows.map((row) => [row.igdbId!, row.id]))
  let toCollection: number[] = []
  if (input.collectionId && plan.present.length) {
    const presentItemIds = plan.present.flatMap((id) => itemIdOf.get(id) ?? [])
    const inside = presentItemIds.length
      ? await db
          .select({ itemId: collectionItems.itemId })
          .from(collectionItems)
          .where(
            and(
              eq(collectionItems.collectionId, input.collectionId),
              inArray(collectionItems.itemId, presentItemIds),
            ),
          )
      : []
    const insideIds = new Set(inside.map((row) => row.itemId))
    toCollection = plan.present.filter(
      (id) => !insideIds.has(itemIdOf.get(id) ?? ''),
    )
    const [row] = await db
      .select({ n: count() })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, input.collectionId))
    const used = row?.n ?? 0
    if (used + toCollection.length > limits.gamesPerCollection) {
      noRoomFor('collection', limits.gamesPerCollection - used)
    }
  }

  const statements = []
  if (plan.writes.length) {
    statements.push(
      db
        .insert(libraryItems)
        .values(
          plan.writes.map(({ igdbId, state }) => ({
            ownerId,
            igdbId,
            name: catalog.get(igdbId)!.name,
            coverId: catalog.get(igdbId)!.coverId,
            ...state,
          })),
        )
        .onConflictDoUpdate({
          target: [libraryItems.ownerId, libraryItems.igdbId],
          targetWhere: sql`${libraryItems.igdbId} is not null`,
          set: {
            owned: sql`excluded.owned`,
            wishlisted: sql`excluded.wishlisted`,
            ownedOn: sql`excluded.owned_on`,
            wantedOn: sql`excluded.wanted_on`,
            updatedAt: new Date(),
          },
        }),
    )
  }
  if (input.collectionId && toCollection.length) {
    const last = (await lastPositions([input.collectionId])).get(
      input.collectionId,
    )
    statements.push(
      db.execute(sql`
        insert into collection_items (collection_id, item_id, position)
        select ${input.collectionId}::uuid, item.id,
          ${last ?? 0}::double precision
            + row_number() over (order by item.created_at, item.id)
        from library_items as item
        where item.owner_id = ${ownerId}::uuid
          and item.igdb_id in (${sql.join(
            toCollection.map((id) => sql`${id}`),
            sql`, `,
          )})
        on conflict do nothing`),
    )
  }
  // A barcode is saved as a pick, for review, for a game that is now in the
  // library: one just added, or one that was already there.
  const inLibrary = new Set([...plan.present, ...existing.keys()])
  const picks = await withRoomForPicks(
    ownerId,
    ownPicks(input.entries, inLibrary, catalog),
  )
  if (picks.length) {
    statements.push(
      db
        .insert(barcodeLookups)
        .values(
          picks.map((pick) => ({
            ...pick,
            source: 'user' as const,
            submittedBy: ownerId,
            status: 'pending' as const,
          })),
        )
        .onConflictDoUpdate({
          target: [barcodeLookups.code, barcodeLookups.submittedBy],
          targetWhere: sql`${barcodeLookups.source} = 'user' and ${barcodeLookups.submittedBy} is not null`,
          set: {
            igdbId: sql`excluded.igdb_id`,
            platformId: sql`excluded.platform_id`,
            status: 'pending',
            reviewedAt: null,
            sentAt: null,
            updatedAt: new Date(),
          },
          // An approved pick is not touched (it serves everyone), and a
          // pick naming the same game and platform is left as it is, which
          // keeps a rejected one rejected.
          setWhere: sql`${barcodeLookups.status} <> 'approved' and (${barcodeLookups.igdbId}, ${barcodeLookups.platformId}) is distinct from (excluded.igdb_id, excluded.platform_id)`,
        }),
    )
  }
  if (statements.length) {
    await db.batch(statements as [(typeof statements)[0]])
  }

  return {
    added: plan.added,
    withoutPlatform: plan.withoutPlatform,
    skipped: plan.skipped,
    inCollection: toCollection.length,
  }
}
