import { z } from 'zod'
import type { BarcodeResult } from '../../../shared/types/barcode'
import { normalizeBarcode } from '../../../shared/utils/barcode'

const paramsSchema = z.object({
  code: z
    .string()
    .max(20)
    .transform((value, ctx) => {
      const code = normalizeBarcode(value)
      if (!code) ctx.addIssue({ code: 'custom', message: 'Not a barcode' })
      return code ?? ''
    }),
})

/** Real ScanDex lookups a person may make in a day. */
const DAILY_LOOKUPS = 500

/**
 * What a barcode stands for: the game and platform on the box, and where
 * the signed-in user has it. ScanDex is asked only for barcodes our cache
 * doesn't hold (counted against a daily cap per user), and only valid
 * barcodes get that far. `match` is null when no game has the barcode.
 */
export default defineEventHandler(async (event): Promise<BarcodeResult> => {
  const { sub } = await requireAuth(event)
  const { code } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await findOrCreateUser(sub)
  const answer = await lookupBarcode(code, () =>
    rateLimit(event, `barcode:${user.id}`, {
      limit: DAILY_LOOKUPS,
      windowSeconds: 24 * 60 * 60,
    }),
  )
  if (answer.kind === 'none') return { match: null }
  return { match: await describeMatch(user.id, answer) }
})
