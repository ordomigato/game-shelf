import { z } from 'zod'
import type { BarcodeReviewOutcome } from '../../../shared/types/barcode'

const bodySchema = z.object({
  action: z.enum(['approve', 'approveAndSend', 'reject', 'send']),
  groups: z
    .array(
      z.object({
        code: z.string().max(20),
        igdbId: z.number().int().positive(),
        platformId: z.number().int().positive().nullable(),
      }),
    )
    .min(1)
    .max(20),
})

/**
 * Approves, rejects or sends up to 20 groups of barcode picks and says how
 * each went (see `reviewGroups`). Only for the barcode reviewer. Anyone else
 * gets a 404 before the body is read. ScanDex's error text goes to the
 * reviewer alone.
 */
export default defineEventHandler(
  async (event): Promise<BarcodeReviewOutcome[]> => {
    await requireReviewer(event)
    const { action, groups } = await readValidatedBody(event, bodySchema.parse)
    return reviewGroups(action, groups)
  },
)
