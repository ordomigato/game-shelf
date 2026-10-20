import { toast } from 'vue-sonner'
import type { LibraryItem, ListName } from '#shared/types/collection'

/**
 * "Got it" and "Move to Wishlist" for a row. They only change which list
 * the game is on: it keeps its collections and values. Each resolves with
 * the game's new state, or null when it couldn't be saved (with a message).
 * A success message links to the list the game moved to. `announce` shows
 * the same message for a game that moved some other way.
 */
export function useListMoves(shelfPath: Ref<string>) {
  const { t } = useI18n()
  const collections = useCollections()

  function moved(list: ListName) {
    toast.success(
      list === 'owned' ? t('table.markedOwned') : t('table.movedToWishlist'),
      {
        action: {
          label: t('table.view'),
          onClick: () => navigateTo(`${shelfPath.value}/${list}`),
        },
      },
    )
  }

  /** Says so when a game gained a list it wasn't on before. */
  function announce(
    before: Partial<Pick<LibraryItem, 'owned' | 'wishlisted'>>,
    after: Pick<LibraryItem, 'owned' | 'wishlisted'>,
  ) {
    if (after.owned && !before.owned) moved('owned')
    else if (after.wishlisted && !before.wishlisted) moved('wishlist')
  }

  async function move(
    itemId: string,
    type: 'gotIt' | 'toWishlist',
  ): Promise<LibraryItem | null> {
    try {
      const { item } = await collections.changeLists(itemId, { type })
      moved(type === 'gotIt' ? 'owned' : 'wishlist')
      return item
    } catch (error) {
      toast.error(limitMessage(error, t) ?? t('table.moveToFailed'))
      return null
    }
  }

  return {
    gotIt: (itemId: string) => move(itemId, 'gotIt'),
    toWishlist: (itemId: string) => move(itemId, 'toWishlist'),
    announce,
  }
}
