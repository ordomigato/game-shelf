import type { CollectionSummary } from '../../../shared/types/collection'

/** The signed-in user's collections, Wishlist first. */
export default defineEventHandler(
  async (event): Promise<CollectionSummary[]> => {
    const { sub } = await requireAuth(event)
    const user = await findOrCreateUser(sub)
    await ensureWishlist(user.id)
    return listCollections(user.id, { publicOnly: false })
  },
)
