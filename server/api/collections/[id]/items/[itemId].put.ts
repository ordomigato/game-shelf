import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid(), itemId: z.uuid() })

/**
 * Adds one of the user's library items to one of their collections (and to
 * Owned, for a custom collection). Answers with the collections it's in.
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
    await assertRoomToAdd(user.id, itemId, [id], userLimits(user))
    await addItemToCollections(user.id, itemId, [id])
    return { collectionIds: await collectionIdsForItem(itemId) }
  },
)
