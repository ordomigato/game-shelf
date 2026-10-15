import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid(), itemId: z.uuid() })

/**
 * Takes an item out of one collection. It stays in the user's library and
 * their other collections, except that out of Owned it also leaves every
 * custom collection. Answers with the collections it's still in.
 */
export default defineEventHandler(
  async (event): Promise<{ collectionIds: string[] }> => {
    const { sub } = await requireAuth(event)
    const { id, itemId } = await getValidatedRouterParams(
      event,
      paramsSchema.parse,
    )
    const user = await findOrCreateUser(sub)
    await getOwnedItem(user.id, itemId)
    await removeItemFromCollection(user.id, id, itemId)
    return { collectionIds: await collectionIdsForItem(itemId) }
  },
)
