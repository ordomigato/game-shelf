/**
 * Which columns of the games table the owner has hidden. The game's name is
 * always shown, so it has no key. A column's key is its built-in name below
 * or, for an account field, the field's id.
 */

export const MAX_HIDDEN_COLUMNS = 100

/** The built-in columns a collection's table has besides the name. */
export const COLLECTION_COLUMNS = [
  'year',
  'genre',
  'platforms',
  'addedAt',
] as const

/** The built-in columns Owned and the Wishlist have besides the name. */
export const LIST_COLUMNS = [
  'inCollections',
  'year',
  'genre',
  'platforms',
  'addedAt',
] as const

export type ColumnsOf = 'collection' | 'list'

/** Every key that can be hidden in this kind of table. */
export function columnKeys(
  of: ColumnsOf,
  fieldIds: readonly string[],
): Set<string> {
  return new Set([
    ...(of === 'list' ? LIST_COLUMNS : COLLECTION_COLUMNS),
    ...fieldIds,
  ])
}

/**
 * The saved keys that still name a column, once each and in order. Keys of
 * fields that were deleted since are dropped.
 */
export function knownHiddenColumns(
  saved: readonly string[] | undefined,
  of: ColumnsOf,
  fieldIds: readonly string[],
): string[] {
  const known = columnKeys(of, fieldIds)
  return [...new Set(saved ?? [])].filter((key) => known.has(key))
}

/** Whether every key names a column of this table. */
export function allColumnsKnown(
  keys: readonly string[],
  of: ColumnsOf,
  fieldIds: readonly string[],
): boolean {
  const known = columnKeys(of, fieldIds)
  return keys.every((key) => known.has(key))
}
