import { z } from 'zod'
import type { BulkAddResult } from '../../../shared/types/barcode'
import { MAX_SCAN_BATCH } from '../../../shared/utils/barcode'

const bodySchema = z.object({
  list: z.enum(['owned', 'wishlist']),
  /** A collection of the user's to put the games in as well. */
  collectionId: z.uuid().optional(),
  items: z
    .array(
      z.object({
        igdbId: z.number().int().positive(),
        platformId: z.number().int().positive().nullable().default(null),
        barcode: z.string().max(20).optional(),
        own: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(MAX_SCAN_BATCH),
})

/**
 * Adds up to 100 IGDB games to Owned or the Wishlist at once, and to one of
 * the user's collections when `collectionId` is given. Each game follows
 * the rules of adding it alone (see `planBulkAdd`). If the library or the
 * collection can't take them all, nothing is added.
 */
export default defineEventHandler(async (event): Promise<BulkAddResult> => {
  const { sub } = await requireAuth(event)
  const { list, collectionId, items } = await readValidatedBody(
    event,
    bodySchema.parse,
  )
  const user = await findOrCreateUser(sub)
  return bulkAdd(user.id, userLimits(user), {
    list,
    collectionId,
    entries: items,
  })
})
