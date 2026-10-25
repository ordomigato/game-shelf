import { z } from 'zod'
import type { BarcodeReviewList } from '../../../shared/types/barcode'

const querySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
})

/**
 * The barcode picks with a status, grouped by barcode, game and platform,
 * for the barcode reviewer. Anyone without the role gets a 404 before
 * anything is read.
 */
export default defineEventHandler(async (event): Promise<BarcodeReviewList> => {
  await authorize(event, 'barcodes.review')
  const { status } = await getValidatedQuery(event, querySchema.parse)
  return listReviewGroups(status)
})
