import type { CollectionSummary } from '#shared/types/collection'

/**
 * The name to show for a collection. The Wishlist is stored as "Wishlist"
 * but shown in the reader's language, since nobody can rename it.
 */
export function useCollectionTitle() {
  const { t } = useI18n()
  return (collection: Pick<CollectionSummary, 'kind' | 'title'>) =>
    collection.kind === 'wishlist' ? t('shelf.wishlist') : collection.title
}
