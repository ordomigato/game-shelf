import type { CollectionKind } from '../types/collection'

/**
 * Whether a collection is one of the lists every user has (Owned and the
 * Wishlist): its title is fixed and it can't be deleted.
 */
export function isBuiltIn(kind: CollectionKind): boolean {
  return kind !== 'custom'
}
