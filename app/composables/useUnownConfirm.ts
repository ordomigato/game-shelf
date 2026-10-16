import type { LibraryItem, ListName } from '#shared/types/collection'

/** A question waiting in the dialog, answered through `resolve`. */
interface UnownQuestion {
  name: string
  list: ListName
  collections: string[]
  resolve: (confirmed: boolean) => void
}

// Browser only: asked from clicks, never while rendering on the server.
const question = shallowRef<UnownQuestion | null>(null)

/**
 * Asks before a game leaves its last list (Owned or the Wishlist), since
 * that deletes it, and takes it out of its collections. `UnownDialog` (in
 * the layout) shows the question. `confirm` resolves true straight away
 * when the game is in no collections, and false when the person cancels.
 */
export function useUnownConfirm() {
  const collections = useCollections()

  function confirm(
    name: string,
    inCollections: string[],
    list: ListName,
  ): Promise<boolean> {
    if (!inCollections.length) return Promise.resolve(true)
    question.value?.resolve(false)
    return new Promise((resolve) => {
      question.value = { name, list, collections: inCollections, resolve }
    })
  }

  /**
   * Takes a game off one list. When that leaves it on neither, the
   * collections it's in come from the server and the person confirms
   * first. Resolves with the game's new state (item null when it was
   * deleted), or null when the person cancels.
   */
  async function leave(
    item: Pick<LibraryItem, 'id' | 'name' | 'owned' | 'wishlisted'>,
    list: ListName,
  ) {
    const deletes = list === 'owned' ? !item.wishlisted : !item.owned
    if (deletes) {
      const links = await collections.itemCollections(item.id)
      const titles = links.map((link) => link.title)
      if (!(await confirm(item.name, titles, list))) return null
    }
    return collections.changeLists(item.id, {
      type: list === 'owned' ? 'unown' : 'unwant',
    })
  }

  function answer(confirmed: boolean) {
    const asked = question.value
    question.value = null
    asked?.resolve(confirmed)
  }

  return { question: readonly(question), confirm, leave, answer }
}
