/**
 * What it takes to turn the collections a game is in (`current`) into the
 * ones it should be in (`wanted`): the ones to join and the ones to leave.
 * Repeated ids count once.
 */
export function collectionChanges(
  current: string[],
  wanted: string[],
): { add: string[]; remove: string[] } {
  const now = new Set(current)
  const next = new Set(wanted)
  return {
    add: [...next].filter((id) => !now.has(id)),
    remove: [...now].filter((id) => !next.has(id)),
  }
}
