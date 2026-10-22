import type { CollectionSummary } from '../../../shared/types/collection'

/** The signed-in user's collections, with their pins. */
export default defineEventHandler(
  async (event): Promise<CollectionSummary[]> => {
    const { user } = await authorize(event, 'library.read')
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
