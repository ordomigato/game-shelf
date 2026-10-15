import type { CollectionSummary } from '../../../shared/types/collection'

/** The signed-in user's collections, Owned and the Wishlist first, with pins. */
export default defineEventHandler(
  async (event): Promise<CollectionSummary[]> => {
    const { sub } = await requireAuth(event)
    const user = await findOrCreateUser(sub)
    const [list, pins] = await Promise.all([
      listCollections(user.id, { publicOnly: false }),
      pinPositions(user.id),
    ])
    return list.map((collection) => ({
      ...collection,
      pinnedPosition: pins.get(collection.id) ?? null,
    }))
  },
)
