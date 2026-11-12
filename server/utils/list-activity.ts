import { eq } from 'drizzle-orm'
import { users } from '../db/schema'

/** The lists a game is on, which is all `touchLists` needs to know. */
interface OnLists {
  owned: boolean
  wishlisted: boolean
}

/**
 * Records that Owned or the Wishlist changed, for followers' home pages: a
 * game on the list was added, removed or edited. Pass the state of the game
 * before and after (or just one when it was added or removed). A list is
 * touched when any of them has the game on it.
 */
export async function touchLists(
  ownerId: string,
  ...states: OnLists[]
): Promise<void> {
  const owned = states.some((state) => state.owned)
  const wishlist = states.some((state) => state.wishlisted)
  if (!owned && !wishlist) return
  const now = new Date()
  await useDb()
    .update(users)
    .set({
      ...(owned && { ownedUpdatedAt: now }),
      ...(wishlist && { wishlistUpdatedAt: now }),
    })
    .where(eq(users.id, ownerId))
}
