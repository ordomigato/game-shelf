import { and, eq, inArray } from 'drizzle-orm'
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
 * Puts one of the user's games in the collections `add` and takes it out of
 * the ones in `remove`, leaving every other link alone, so a page that is
 * out of date can't undo what changed elsewhere. Every id must be the
 * user's (404 otherwise, before any limit is looked at). Room is checked
 * only for the collections the game isn't in yet. Joining one it's already
 * in, or leaving one it isn't in, does nothing. The writes happen together,
 * and a joined collection puts the game last. The game's lists and values
 * stay as they are. Resolves with every collection the game is in now.
 */
export async function setItemCollections(
  ownerId: string,
  itemId: string,
  change: { add: string[]; remove: string[] },
  limits: PlanLimits,
): Promise<string[]> {
  const add = [...new Set(change.add)]
  const remove = [...new Set(change.remove)]
  await getOwnedItem(ownerId, itemId)
  await assertOwnsCollections(ownerId, [...add, ...remove])
  const current = await collectionIdsForItem(itemId)
  const joining = add.filter((id) => !current.includes(id))
  await assertCollectionsRoom(joining, 1, limits)
  if (!joining.length && !remove.length) return current

  const db = useDb()
  const leave = db
    .delete(collectionItems)
    .where(
      and(
        eq(collectionItems.itemId, itemId),
        inArray(collectionItems.collectionId, remove),
      ),
    )
  const last = joining.length
    ? await lastPositions(joining)
    : new Map<string, number>()
  const join = db
    .insert(collectionItems)
    .values(
      joining.map((collectionId) => ({
        collectionId,
        itemId,
        position: (last.get(collectionId) ?? 0) + 1,
      })),
    )
    .onConflictDoNothing()
  try {
    if (joining.length && remove.length) await db.batch([leave, join])
    else if (joining.length) await join
    else await leave
  } catch (error) {
    // The game or a collection was deleted since the checks above.
    if (isForeignKeyViolation(error)) throw notFound()
    throw error
  }
  return collectionIdsForItem(itemId)
}
