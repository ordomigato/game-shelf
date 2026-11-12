import type { FollowUpdates } from '../../../../shared/types/follows'

/**
 * The home page's "From accounts you follow": the 10 newest changes in the
 * last 30 days, from public collections and public Owned and Wishlist lists.
 */
export default defineEventHandler(async (event): Promise<FollowUpdates> => {
  const { user } = await authorize(event, 'account.read')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const [anyone, items] = await Promise.all([
    followsAnyone(user.id),
    followingUpdates(user.id),
  ])
  return { followsAnyone: anyone, items: anyone ? items : [] }
})
