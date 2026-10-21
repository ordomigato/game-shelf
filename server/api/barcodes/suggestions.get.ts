import type { BarcodeSuggestion } from '../../../shared/types/barcode'

/**
 * The user's own picks that ScanDex could be told about, with the game,
 * cover and platform from our catalog. Only for accounts allowed to share
 * barcodes. Anyone else gets a 404.
 */
export default defineEventHandler(
  async (event): Promise<BarcodeSuggestion[]> => {
    const user = await requireContributor(event)
    return listSuggestions(user.id)
  },
)
