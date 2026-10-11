import { and, asc, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { pinnedCollections } from '../db/schema'

/** The user's pinned collections, as collection id → position. */
export async function pinPositions(
  userId: string,
): Promise<Map<string, number>> {
  const rows = await useDb()
    .select({
      collectionId: pinnedCollections.collectionId,
      position: pinnedCollections.position,
    })
    .from(pinnedCollections)
    .where(eq(pinnedCollections.userId, userId))
  return new Map(rows.map((row) => [row.collectionId, row.position]))
}

/**
 * Pins one of the user's collections to their sidebar, or moves a pin.
 * `afterCollectionId` is the pinned collection it goes after: null for the
 * top, undefined for the bottom.
 */
export async function pinCollection(
  userId: string,
  collectionId: string,
  afterCollectionId: string | null | undefined,
): Promise<{ position: number }> {
  if (afterCollectionId === collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A collection cannot follow itself',
    })
  }
  await getOwnedCollection(userId, collectionId)
  const db = useDb()

  for (let attempt = 0; attempt < 2; attempt++) {
    const others = (
      await db
        .select({
          collectionId: pinnedCollections.collectionId,
          position: pinnedCollections.position,
        })
        .from(pinnedCollections)
        .where(eq(pinnedCollections.userId, userId))
        .orderBy(asc(pinnedCollections.position))
    ).filter((row) => row.collectionId !== collectionId)

    const index =
      afterCollectionId === undefined
        ? others.length - 1
        : afterCollectionId === null
          ? -1
          : others.findIndex((row) => row.collectionId === afterCollectionId)
    if (afterCollectionId && index === -1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'That collection is not pinned',
      })
    }

    const position = positionBetween(
      others[index]?.position ?? null,
      others[index + 1]?.position ?? null,
    )
    if (position !== null) {
      await db
        .insert(pinnedCollections)
        .values({ userId, collectionId, position })
        .onConflictDoUpdate({
          target: [pinnedCollections.userId, pinnedCollections.collectionId],
          set: { position },
        })
      return { position }
    }
    // Neighbours too close together: number the pins 1, 2, 3... and retry.
    await db.execute(sql`
      UPDATE pinned_collections AS pin
      SET position = ranked.rank
      FROM (
        SELECT collection_id, row_number() OVER (ORDER BY position) AS rank
        FROM pinned_collections
        WHERE user_id = ${userId}
      ) AS ranked
      WHERE pin.user_id = ${userId}
        AND pin.collection_id = ranked.collection_id
    `)
  }
  throw new Error('Could not find room to pin the collection after renumbering')
}

/** Unpins a collection from the user's sidebar. Fine if it wasn't pinned. */
export async function unpinCollection(
  userId: string,
  collectionId: string,
): Promise<void> {
  await useDb()
    .delete(pinnedCollections)
    .where(
      and(
        eq(pinnedCollections.userId, userId),
        eq(pinnedCollections.collectionId, collectionId),
      ),
    )
}
