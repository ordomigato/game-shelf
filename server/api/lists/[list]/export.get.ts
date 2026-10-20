import { z } from 'zod'
import { collectionCsv } from '../../../../shared/utils/csv'

const paramsSchema = z.object({ list: z.enum(['owned', 'wishlist']) })

/**
 * Downloads the whole of Owned or the Wishlist as one CSV file, the way a
 * collection exports: name, IGDB id and date added, then a column per field.
 * Search and filters on screen don't narrow it.
 */
export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const { list } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await findOrCreateUser(sub)
  await rateLimit(event, `export:${user.id}`, { limit: 3, windowSeconds: 600 })
  const [fields, items] = await Promise.all([
    getUserFields(user.id),
    listForExport(user.id, list),
  ])
  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${list}.csv"`,
    'Cache-Control': 'no-store',
  })
  return collectionCsv(fields, items, exportColumns())
})
