/**
 * For moving an item so it ends up at `index` in `list`: the id of the item
 * it should follow, or null to put it first. `index` is clamped to the list.
 */
export function afterIdForIndex(
  list: { id: string }[],
  itemId: string,
  index: number,
): string | null {
  const others = list.filter((item) => item.id !== itemId)
  const target = Math.max(0, Math.min(index, others.length))
  return target === 0 ? null : others[target - 1]!.id
}

/** `list` with `itemId` moved to just after `afterItemId` (first if null). */
export function moveAfter<T extends { id: string }>(
  list: T[],
  itemId: string,
  afterItemId: string | null,
): T[] {
  const moved = list.find((item) => item.id === itemId)
  if (!moved) return list
  const others = list.filter((item) => item.id !== itemId)
  const at =
    afterItemId === null
      ? 0
      : others.findIndex((item) => item.id === afterItemId) + 1
  if (afterItemId !== null && at === 0) return list
  return [...others.slice(0, at), moved, ...others.slice(at)]
}
