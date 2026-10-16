import { toast } from 'vue-sonner'
import type {
  CollectionLink,
  CollectionSummary,
} from '#shared/types/collection'

/**
 * "Add to" for a row: puts a game in one of the owner's collections. It
 * leaves the game's other collections and its place on the lists alone.
 * Resolves with the link to show in the row, or null when it couldn't be
 * saved (with a message). A success message links to the collection.
 */
export function useAddToCollection(shelfPath: Ref<string>) {
  const { t } = useI18n()
  const collections = useCollections()

  return async function addToCollection(
    itemId: string,
    target: CollectionSummary,
  ): Promise<CollectionLink | null> {
    try {
      await collections.addItem(target.id, itemId)
    } catch (error) {
      toast.error(
        limitMessage(error, t) ??
          t('table.addToFailed', { collection: target.title }),
      )
      return null
    }
    toast.success(t('table.addedTo', { collection: target.title }), {
      action: {
        label: t('table.view'),
        onClick: () => navigateTo(`${shelfPath.value}/${target.slug}`),
      },
    })
    return {
      id: target.id,
      title: target.title,
      slug: target.slug,
      color: target.color,
    }
  }
}
