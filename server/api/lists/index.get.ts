import type { ListName } from '../../../shared/types/collection'

/** How many games the signed-in user has on Owned and the Wishlist. */
export default defineEventHandler(
  async (event): Promise<Record<ListName, number>> => {
    const { sub } = await requireAuth(event)
    const user = await findOrCreateUser(sub)
    return listCounts(user.id)
  },
)
