import { z } from 'zod'
import type { BulkAddResult } from '../../../shared/types/barcode'
import { MAX_SCAN_BATCH } from '../../../shared/utils/barcode'

/** Up to a batch of games to add, plus barcodes to remember for them. */
const MAX_BATCH_ITEMS = MAX_SCAN_BATCH * 2

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
        rememberOnly: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(MAX_BATCH_ITEMS)
    .refine(
      (items) =>
        items.filter((item) => !item.rememberOnly).length <= MAX_SCAN_BATCH &&
        items.filter((item) => item.rememberOnly).length <= MAX_SCAN_BATCH,
      { message: 'Too many games to add' },
    ),
})

/**
 * Adds up to 100 IGDB games to Owned or the Wishlist at once, and to one of
 * the user's collections when `collectionId` is given. Each game follows
 * the rules of adding it alone (see `planBulkAdd`). If the library or the
 * collection can't take them all, nothing is added. Items marked `own` carry
 * a barcode the user matched themselves, which is saved as a pick for review
 * (see `bulkAdd`). Items marked `rememberOnly` are never added.
 */
export default defineEventHandler(async (event): Promise<BulkAddResult> => {
  const { user, subject } = await authorize(event, 'library.write')
  const { list, collectionId, items } = await readValidatedBody(
    event,
    bodySchema.parse,
  )
  if (collectionId) {
    await assertCanOnCollections(subject, 'collection.update', [collectionId])
  }
  return bulkAdd(user.id, userLimits(user), {
    list,
    collectionId,
    entries: items,
  })
})
