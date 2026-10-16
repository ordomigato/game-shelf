import { z } from 'zod'

const querySchema = z.object({
  ids: z
    .string()
    .transform((value) => value.split(',').filter(Boolean).map(Number))
    .pipe(z.array(z.number().int().positive()).max(100)),
  /** Only count games in this collection. */
  collection: z.uuid().optional(),
  /** Only count games on this list. */
  list: z.enum(['owned', 'wishlist']).optional(),
})

/**
 * Of the IGDB games in `?ids=1,2,3`, the ones the user already has (on a
 * list), or only those in `?collection=<id>` or on `?list=owned`, with
 * their item ids. Search results use it to mark games the user has.
 */
export default defineEventHandler(
  async (event): Promise<{ igdbId: number; itemId: string }[]> => {
    const { sub } = await requireAuth(event)
    const { ids, collection, list } = await getValidatedQuery(
      event,
      querySchema.parse,
    )
    const user = await findOrCreateUser(sub)
    // An unknown or someone else's collection is a 404, not an empty list.
    if (collection) await getOwnedCollection(user.id, collection)
    return trackedItems(user.id, ids, { collectionId: collection, list })
  },
)
