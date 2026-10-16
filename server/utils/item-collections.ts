import { and, eq, inArray } from 'drizzle-orm'
import { collectionChanges } from '../../shared/utils/collection-sets'
import type { PlanLimits } from '../../shared/utils/plans'
import { collectionItems } from '../db/schema'
import {
  assertOwnsCollections,
  collectionIdsForItem,
  getOwnedItem,
  lastPositions,
  notFound,
} from './collections'
import { useDb } from './db'
import { isForeignKeyViolation } from './db-errors'
import { assertCollectionsRoom } from './limits'

/**
 * Sets the custom collections one of the user's games is in to exactly
 * `collectionIds`. Every id must be the user's (404 otherwise, before any
 * limit is looked at). Room is checked only for the collections the game
 * joins. Joins and leaves are written together, and a joined collection puts
 * the game last. The game's lists and values stay as they are. Resolves
 * with the collections the game is in now.
 */
export async function setItemCollections(
  ownerId: string,
  itemId: string,
  collectionIds: string[],
  limits: PlanLimits,
): Promise<string[]> {
  const wanted = [...new Set(collectionIds)]
  await getOwnedItem(ownerId, itemId)
  await assertOwnsCollections(ownerId, wanted)
  const { add, remove } = collectionChanges(
    await collectionIdsForItem(itemId),
    wanted,
  )
  await assertCollectionsRoom(add, 1, limits)
  if (!add.length && !remove.length) return wanted

  const db = useDb()
  const leave = db
    .delete(collectionItems)
    .where(
      and(
        eq(collectionItems.itemId, itemId),
        inArray(collectionItems.collectionId, remove),
      ),
    )
  const last = add.length ? await lastPositions(add) : new Map<string, number>()
  const join = db
    .insert(collectionItems)
    .values(
      add.map((collectionId) => ({
        collectionId,
        itemId,
        position: (last.get(collectionId) ?? 0) + 1,
      })),
    )
    .onConflictDoNothing()
  try {
    if (add.length && remove.length) await db.batch([leave, join])
    else if (add.length) await join
    else await leave
  } catch (error) {
    // The game or a collection was deleted since the checks above.
    if (isForeignKeyViolation(error)) throw notFound()
    throw error
  }
  return wanted
}
