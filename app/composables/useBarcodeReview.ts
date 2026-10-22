import type {
  BarcodeReviewAction,
  BarcodeReviewList,
  BarcodeReviewOutcome,
  BarcodeReviewStatus,
  BarcodeReviewTarget,
} from '#shared/types/barcode'

/** The most groups one request carries (the server's `MAX_REVIEWS`). */
export const REVIEW_ROUND_SIZE = 20

/** Splits a list into rounds of at most `size`. */
export function inRounds<T>(items: T[], size = REVIEW_ROUND_SIZE): T[][] {
  const rounds: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    rounds.push(items.slice(i, i + size))
  }
  return rounds
}

/** The part of a group that says which one it is. */
export const targetOf = (group: BarcodeReviewTarget): BarcodeReviewTarget => ({
  code: group.code,
  igdbId: group.igdbId,
  platformId: group.platformId,
})

/**
 * Reviewing the barcode picks people made. Only the barcode reviewer can use
 * it: for anyone else the routes answer 404.
 */
export function useBarcodeReview() {
  const auth = useAuth()

  /** The picks with a status, grouped by barcode, game and platform. */
  function list(status: BarcodeReviewStatus) {
    return auth.apiFetch<BarcodeReviewList>('/api/barcodes/reviews', {
      query: { status },
      retry: 0,
    })
  }

  /** Does an action on up to 20 groups and says how each went. */
  function act(action: BarcodeReviewAction, groups: BarcodeReviewTarget[]) {
    return auth.apiFetch<BarcodeReviewOutcome[]>('/api/barcodes/reviews', {
      method: 'POST',
      body: { action, groups },
      retry: 0,
    })
  }

  /**
   * Does an action on any number of groups in rounds of 20, one request per
   * round and one round after another, so a long list stays inside the rate
   * limit. `onRound` gets each round's outcomes as they arrive, and how many
   * groups are done. If a request fails, the error is thrown and the later
   * rounds are not sent.
   */
  async function actInRounds(
    action: BarcodeReviewAction,
    groups: BarcodeReviewTarget[],
    onRound?: (outcomes: BarcodeReviewOutcome[], done: number) => void,
  ) {
    let done = 0
    for (const round of inRounds(groups)) {
      const outcomes = await act(action, round)
      done += round.length
      onRound?.(outcomes, done)
    }
  }

  return { list, act, actInRounds }
}
