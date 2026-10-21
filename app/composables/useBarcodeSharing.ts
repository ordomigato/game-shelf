import type { BarcodeSuggestion, SuggestionResult } from '#shared/types/barcode'

/** The most codes one send request carries (the server's `MAX_SENDS`). */
export const SEND_ROUND_SIZE = 20

/** Splits a list into rounds of at most `size`. */
export function inRounds<T>(items: T[], size = SEND_ROUND_SIZE): T[][] {
  const rounds: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    rounds.push(items.slice(i, i + size))
  }
  return rounds
}

/**
 * Sharing the user's own barcode picks with ScanDex. Only accounts allowed to
 * share can use it: for anyone else the routes answer 404.
 */
export function useBarcodeSharing() {
  const auth = useAuth()

  /** Every pick of the user's that hasn't been shared yet. */
  function list() {
    return auth.apiFetch<BarcodeSuggestion[]>('/api/barcodes/suggestions', {
      retry: 0,
    })
  }

  /** Shares up to 20 picks and says how each went. */
  function send(codes: string[]) {
    return auth.apiFetch<SuggestionResult[]>('/api/barcodes/suggestions', {
      method: 'POST',
      body: { codes },
      retry: 0,
    })
  }

  /**
   * Shares any number of picks in rounds of 20, one request per round and one
   * round after another, so a long list stays inside the rate limit.
   * `onRound` gets each round's results as they arrive, and how many picks
   * are done. If a request fails, the error is thrown and the later rounds
   * are not sent.
   */
  async function sendInRounds(
    codes: string[],
    onRound?: (results: SuggestionResult[], done: number) => void,
  ) {
    let done = 0
    for (const round of inRounds(codes)) {
      const results = await send(round)
      done += round.length
      onRound?.(results, done)
    }
  }

  return { list, send, sendInRounds }
}
