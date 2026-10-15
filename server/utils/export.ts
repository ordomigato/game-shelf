import { asc, eq } from 'drizzle-orm'
import { strToU8, zipSync } from 'fflate'
import { collectionCsv, FIXED_COLUMNS } from '../../shared/utils/csv'
import {
  blueprints,
  collectionItems,
  collections,
  games,
  libraryItems,
} from '../db/schema'
import { catalogJoin, itemName } from './collections'

/**
 * Everything the user has: every collection, Wishlist included, as CSV
 * files in one zip, each built the same way as a single collection's export
 * in the browser.
 */
export async function exportEverything(ownerId: string): Promise<Buffer> {
  const db = useDb()
  const columns = FIXED_COLUMNS.map((column) => translate(column)) as [
    string,
    string,
    string,
  ]
  const owned = await db
    .select()
    .from(collections)
    .where(eq(collections.ownerId, ownerId))
    .orderBy(asc(collections.createdAt))
  const files: Record<string, Uint8Array> = {}
  for (const collection of owned) {
    const [[blueprint], entries] = await Promise.all([
      db
        .select({ fields: blueprints.fields })
        .from(blueprints)
        .where(eq(blueprints.id, collection.blueprintId)),
      db
        .select({
          item: libraryItems,
          name: itemName,
          addedAt: collectionItems.addedAt,
        })
        .from(collectionItems)
        .innerJoin(libraryItems, eq(libraryItems.id, collectionItems.itemId))
        .leftJoin(games, catalogJoin)
        .where(eq(collectionItems.collectionId, collection.id))
        .orderBy(asc(collectionItems.position), asc(collectionItems.addedAt)),
    ])
    const csv = collectionCsv(
      blueprint?.fields ?? [],
      entries.map(({ item, name, addedAt }) => ({
        name,
        igdbId: item.igdbId,
        addedAt: addedAt.toISOString(),
        data: item.data,
      })),
      columns,
    )
    files[`${collection.slug}.csv`] = strToU8(csv)
  }
  return Buffer.from(zipSync(files, { level: 6 }))
}
