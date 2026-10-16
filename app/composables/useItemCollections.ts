import { toast } from 'vue-sonner'
import type {
  CollectionLink,
  CollectionSummary,
} from '#shared/types/collection'

/**
 * Changes the collections a row's game is in, for the table's "Add to" menu
 * and dialog: only the ones just ticked (`add`) or unticked (`remove`).
 * When one of them has been deleted meanwhile (404), the sidebar's
 * collections are loaded again and `onMissing` lets the page reload its
 * data. `saving` holds the items being saved, so their checkboxes can
 * be disabled until the answer is back. Resolves with the links to show in
 * the row, in the order of `targets`, or null when it couldn't be saved
 * (with a message).
 */
export function useItemCollections(onMissing?: () => void) {
  const { t } = useI18n()
  const collections = useCollections()
  const sidebar = useMyCollections()
  const saving = ref(new Set<string>())

  async function save(
    itemId: string,
    change: { add: string[]; remove: string[] },
    targets: CollectionSummary[],
  ): Promise<CollectionLink[] | null> {
    if (saving.value.has(itemId)) return null
    saving.value = new Set(saving.value).add(itemId)
    try {
      const saved = await collections.setItemCollections(itemId, change)
      return targets
        .filter((target) => saved.collectionIds.includes(target.id))
        .map(({ id, title, slug, color }) => ({ id, title, slug, color }))
    } catch (error) {
      if (isNotFound(error)) {
        void sidebar.refresh()
        onMissing?.()
      }
      toast.error(limitMessage(error, t) ?? t('table.collectionsFailed'))
      return null
    } finally {
      const done = new Set(saving.value)
      done.delete(itemId)
      saving.value = done
    }
  }

  return { saving, save }
}
