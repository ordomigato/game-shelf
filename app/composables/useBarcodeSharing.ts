import type { BarcodeSuggestion, SuggestionResult } from '#shared/types/barcode'

/**
 * Sharing the user's own barcode picks with ScanDex. Only accounts allowed to
 * share can use it: for anyone else the routes answer 404.
 */
export function useBarcodeSharing() {
  const auth = useAuth()

  /** The user's picks that haven't been shared yet. */
  function list() {
    return auth.apiFetch<BarcodeSuggestion[]>('/api/barcodes/suggestions', {
      retry: 0,
    })
  }

  /** Shares the chosen picks and says how each went. */
  function send(codes: string[]) {
    return auth.apiFetch<SuggestionResult[]>('/api/barcodes/suggestions', {
      method: 'POST',
      body: { codes },
      retry: 0,
    })
  }

  return { list, send }
}
