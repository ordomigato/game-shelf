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
import { getList } from './lists'

/**
 * Everything the user has as CSV files in one zip: every collection, built
 * the same way as a single collection's export in the browser, plus
 * `owned.csv` and `wishlist.csv` with the shared columns only (name, IGDB
 * id, date added).
 */
export async function exportEverything(ownerId: string): Promise<Buffer> {
  const db = useDb()
  const columns = FIXED_COLUMNS.map((column) => translate(column)) as [
    string,
    string,
    string,
  ]
  const mine = await db
    .select()
    .from(collections)
    .where(eq(collections.ownerId, ownerId))
    .orderBy(asc(collections.createdAt))
  const files: Record<string, Uint8Array> = {}
  for (const list of ['owned', 'wishlist'] as const) {
    const { items } = await getList(ownerId, list)
    files[`${list}.csv`] = strToU8(
      collectionCsv(
        [],
        items.map((item) => ({
          name: item.name,
          igdbId: item.igdbId,
          addedAt: item.addedAt,
          data: {},
        })),
        columns,
      ),
    )
  }
  for (const collection of mine) {
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
