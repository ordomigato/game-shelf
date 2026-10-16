import { toast } from 'vue-sonner'
import type { LibraryItem } from '#shared/types/collection'

/**
 * "Got it" and "Move to Wishlist" for a row. They only change which list
 * the game is on: it keeps its collections and values. Each resolves with
 * the game's new state, or null when it couldn't be saved (with a message).
 * A success message links to the list the game moved to.
 */
export function useListMoves(shelfPath: Ref<string>) {
  const { t } = useI18n()
  const collections = useCollections()

  async function move(
    itemId: string,
    type: 'gotIt' | 'toWishlist',
  ): Promise<LibraryItem | null> {
    try {
      const { item } = await collections.changeLists(itemId, { type })
      const list = type === 'gotIt' ? 'owned' : 'wishlist'
      toast.success(
        type === 'gotIt' ? t('table.markedOwned') : t('table.movedToWishlist'),
        {
          action: {
            label: t('table.view'),
            onClick: () => navigateTo(`${shelfPath.value}/${list}`),
          },
        },
      )
      return item
    } catch (error) {
      toast.error(limitMessage(error, t) ?? t('table.moveToFailed'))
      return null
    }
  }

  return {
    gotIt: (itemId: string) => move(itemId, 'gotIt'),
    toWishlist: (itemId: string) => move(itemId, 'toWishlist'),
  }
}
