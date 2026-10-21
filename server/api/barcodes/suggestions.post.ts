import { z } from 'zod'
import type { SuggestionResult } from '../../../shared/types/barcode'

const bodySchema = z.object({
  codes: z.array(z.string().max(20)).min(1).max(20),
})

/**
 * Sends the chosen picks to ScanDex and says how each went (see
 * `sendSuggestions`). Only for accounts allowed to share barcodes. Anyone
 * else gets a 404. ScanDex's error text goes to this user alone.
 */
export default defineEventHandler(
  async (event): Promise<SuggestionResult[]> => {
    const user = await requireContributor(event)
    const { codes } = await readValidatedBody(event, bodySchema.parse)
    return sendSuggestions(user.id, codes)
  },
)
