import { and, desc, eq, min, ne, sql } from 'drizzle-orm'
import type { OwnedGame } from '../../shared/types/collection'
import { collectionItems, collections, libraryItems } from '../db/schema'

/**
 * Every game the user owns: in at least one of their collections other than
 * the Wishlist. One query, newest first, with the collections each is in.
 */
export async function ownedGames(ownerId: string): Promise<OwnedGame[]> {
  const rows = await useDb()
    .select({
      id: libraryItems.id,
      igdbId: libraryItems.igdbId,
      name: libraryItems.name,
      coverId: libraryItems.coverId,
      addedAt: min(collectionItems.addedAt),
      collections: sql<OwnedGame['collections']>`json_agg(
        json_build_object(
          'id', ${collections.id},
          'title', ${collections.title},
          'slug', ${collections.slug}
        ) order by lower(${collections.title})
      )`,
    })
    .from(libraryItems)
    .innerJoin(collectionItems, eq(collectionItems.itemId, libraryItems.id))
    .innerJoin(collections, eq(collections.id, collectionItems.collectionId))
    .where(
      and(
        eq(libraryItems.ownerId, ownerId),
        eq(collections.ownerId, ownerId),
        ne(collections.kind, 'wishlist'),
      ),
    )
    .groupBy(libraryItems.id)
    .orderBy(desc(min(collectionItems.addedAt)), libraryItems.name)
  return rows.map((row) => ({
    ...row,
    addedAt: (row.addedAt ?? new Date(0)).toISOString(),
  }))
}
