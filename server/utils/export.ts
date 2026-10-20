import { asc, eq } from 'drizzle-orm'
import { strToU8, zipSync } from 'fflate'
import { collectionCsv, FIXED_COLUMNS } from '../../shared/utils/csv'
import { collectionItems, collections, games, libraryItems } from '../db/schema'
import { catalogJoin, getUserFields, itemName } from './collections'
import { exportItemsOf, listForExport } from './lists'

/** The first seven column names of an export, in English. */
export const exportColumns = () =>
  FIXED_COLUMNS.map((column) => translate(column))

/**
 * Everything the user has as CSV files in one zip: every collection, built
 * the same way as a single collection's export in the browser, plus
 * `owned.csv` and `wishlist.csv`. Every file has the name, IGDB id, date
 * added, release date, genres and owned platforms, then a column per field
 * the user keeps.
 */
export async function exportEverything(ownerId: string): Promise<Buffer> {
  const db = useDb()
  const columns = exportColumns()
  const fields = await getUserFields(ownerId)
  const mine = await db
    .select()
    .from(collections)
    .where(eq(collections.ownerId, ownerId))
    .orderBy(asc(collections.createdAt))
  const files: Record<string, Uint8Array> = {}
  for (const list of ['owned', 'wishlist'] as const) {
    files[`${list}.csv`] = strToU8(
      collectionCsv(fields, await listForExport(ownerId, list), columns),
    )
  }
  for (const collection of mine) {
    const entries = await db
      .select({
        item: libraryItems,
        game: games,
        name: itemName,
        addedAt: collectionItems.addedAt,
      })
      .from(collectionItems)
      .innerJoin(libraryItems, eq(libraryItems.id, collectionItems.itemId))
      .leftJoin(games, catalogJoin)
      .where(eq(collectionItems.collectionId, collection.id))
      .orderBy(asc(collectionItems.position), asc(collectionItems.addedAt))
    const csv = collectionCsv(
      fields,
      await exportItemsOf(
        entries.map(({ item, game, name, addedAt }) => ({
          name,
          igdbId: item.igdbId,
          addedAt: addedAt.toISOString(),
          data: item.data,
          ownedOn: item.ownedOn,
          wantedOn: item.wantedOn,
          game,
        })),
      ),
      columns,
    )
    files[`${collection.slug}.csv`] = strToU8(csv)
  }
  return Buffer.from(zipSync(files, { level: 6 }))
}
