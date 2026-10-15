import type { CollectionSummary } from '#shared/types/collection'

/**
 * The name to show for a collection. Owned and the Wishlist are stored in
 * English but shown in the reader's language, since nobody can rename them.
 */
export function useCollectionTitle() {
  const { t } = useI18n()
  return (collection: Pick<CollectionSummary, 'kind' | 'title'>) =>
    collection.kind === 'wishlist'
      ? t('shelf.wishlist')
      : collection.kind === 'owned'
        ? t('shelf.owned')
        : collection.title
}
