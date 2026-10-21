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
import { collectionItems, libraryItems } from '../db/schema'
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
  input: { list: ListName; collectionId?: string; entries: BulkAddEntry[] },
): Promise<BulkAddResult> {
  const db = useDb()
  const entries = dedupeEntries(input.entries)
  const igdbIds = [...new Set(entries.map((entry) => entry.igdbId))]
  if (input.collectionId) {
    await assertOwnsCollections(ownerId, [input.collectionId])
  }

  const [catalogRows, existingRows] = await Promise.all([
    ensureCatalogGames(igdbIds),
    db
      .select()
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.ownerId, ownerId),
          inArray(libraryItems.igdbId, igdbIds),
        ),
      ),
  ])
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
