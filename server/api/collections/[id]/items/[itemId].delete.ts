import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid(), itemId: z.uuid() })

/**
 * Takes an item out of one collection. It stays in the user's library, on
 * its lists and in their other collections. Answers with the collections
 * it's still in.
 */
export default defineEventHandler(
  async (event): Promise<{ collectionIds: string[] }> => {
    const { user, subject } = await authorize(
      event,
      'collection.update',
      collectionOf(event),
    )
    const { id, itemId } = await getValidatedRouterParams(
      event,
      paramsSchema.parse,
    )
    assertCan(subject, 'library.write', await itemResource(itemId))
    await getOwnedItem(user.id, itemId)
    await removeItemFromCollection(user.id, id, itemId)
    return { collectionIds: await collectionIdsForItem(itemId) }
  },
)
