/**
 * Smallest gap kept between neighbours before a collection is renumbered.
 * Doubles halve cleanly about 50 times between two whole numbers, so this
 * leaves plenty of room while catching runs of moves into the same spot.
 */
export const MIN_POSITION_GAP = 1e-6

/**
 * The position for a game placed between two neighbours (null at either
 * end). Returns null when the neighbours are too close together, meaning
 * the collection should be renumbered first.
 */
export function positionBetween(
  before: number | null,
  after: number | null,
): number | null {
  if (before === null && after === null) return 1
  if (before === null) return after! - 1
  if (after === null) return before + 1
  if (after - before < MIN_POSITION_GAP * 2) return null
  return (before + after) / 2
}
