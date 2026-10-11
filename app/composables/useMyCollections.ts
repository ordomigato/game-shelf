import { toast } from 'vue-sonner'
import type { CollectionSummary } from '#shared/types/collection'

/**
 * The signed-in user's collections for the sidebar, shared by every
 * component. `null` until the first load. Anything that adds, removes or
 * renames collections, or changes what's in them, calls `refresh`.
 *
 * Pins change here first and are saved after, so the sidebar responds at
 * once. A pin that fails to save is put back, with a message.
 */
export function useMyCollections() {
  const auth = useAuth()
  // Not useI18n: this also runs outside components, via useCollections.
  const { $i18n } = useNuxtApp()
  const titleOf = (collection: CollectionSummary) =>
    collection.kind === 'wishlist'
      ? $i18n.t('shelf.wishlist')
      : collection.title
  const list = useState<CollectionSummary[] | null>(
    'my-collections',
    () => null,
  )

  async function refresh() {
    try {
      list.value = await auth.apiFetch<CollectionSummary[]>('/api/collections')
    } catch {
      // The sidebar keeps what it had; the pages show their own errors.
      list.value ??= []
    }
  }

  /** Pinned collections, in the user's order. */
  const pinned = computed(() =>
    (list.value ?? [])
      .filter((collection) => collection.pinnedPosition != null)
      .sort((a, b) => a.pinnedPosition! - b.pinnedPosition!),
  )

  /** The rest, most recently changed first. */
  const unpinned = computed(() =>
    (list.value ?? [])
      .filter((collection) => collection.pinnedPosition == null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  )

  function setPosition(id: string, position: number | null) {
    list.value =
      list.value?.map((collection) =>
        collection.id === id
          ? { ...collection, pinnedPosition: position }
          : collection,
      ) ?? null
  }

  /** A position between two pins (null at either end), for showing at once. */
  function between(before: number | null, after: number | null) {
    if (before === null && after === null) return 1
    if (before === null) return after! - 1
    if (after === null) return before + 1
    return (before + after) / 2
  }

  /**
   * Pins a collection, or moves its pin to just after `afterId` (null for
   * the top). Without `afterId` it goes to the bottom.
   */
  async function pin(collection: CollectionSummary, afterId?: string | null) {
    const previous = collection.pinnedPosition ?? null
    const others = pinned.value.filter((other) => other.id !== collection.id)
    const index =
      afterId === undefined
        ? others.length - 1
        : others.findIndex((other) => other.id === afterId)
    setPosition(
      collection.id,
      between(
        others[index]?.pinnedPosition ?? null,
        others[index + 1]?.pinnedPosition ?? null,
      ),
    )
    try {
      const saved = await auth.apiFetch<{ position: number }>(
        `/api/collections/${collection.id}/pin`,
        {
          method: 'PUT',
          body: afterId === undefined ? {} : { afterCollectionId: afterId },
        },
      )
      setPosition(collection.id, saved.position)
    } catch {
      setPosition(collection.id, previous)
      toast.error(
        previous === null
          ? $i18n.t('sidebar.pinFailed', { name: titleOf(collection) })
          : $i18n.t('sidebar.moveFailed', { name: titleOf(collection) }),
      )
    }
  }

  async function unpin(collection: CollectionSummary) {
    const previous = collection.pinnedPosition ?? null
    setPosition(collection.id, null)
    try {
      await auth.apiFetch(`/api/collections/${collection.id}/pin`, {
        method: 'DELETE',
      })
    } catch {
      setPosition(collection.id, previous)
      toast.error($i18n.t('sidebar.unpinFailed', { name: titleOf(collection) }))
    }
  }

  return { list, refresh, pinned, unpinned, pin, unpin }
}
