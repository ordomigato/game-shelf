import { toast } from 'vue-sonner'
import type {
  CollectionLink,
  CollectionSummary,
} from '#shared/types/collection'

/**
 * Sets the collections a row's game is in, for the table's "Add to" menu
 * and dialog. `saving` holds the items being saved, so their checkboxes can
 * be disabled until the answer is back. Resolves with the links to show in
 * the row, in the order of `targets`, or null when it couldn't be saved
 * (with a message).
 */
export function useItemCollections() {
  const { t } = useI18n()
  const collections = useCollections()
  const saving = ref(new Set<string>())

  async function save(
    itemId: string,
    collectionIds: string[],
    targets: CollectionSummary[],
  ): Promise<CollectionLink[] | null> {
    if (saving.value.has(itemId)) return null
    saving.value = new Set(saving.value).add(itemId)
    try {
      const saved = await collections.setItemCollections(itemId, collectionIds)
      return targets
        .filter((target) => saved.collectionIds.includes(target.id))
        .map(({ id, title, slug, color }) => ({ id, title, slug, color }))
    } catch (error) {
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
