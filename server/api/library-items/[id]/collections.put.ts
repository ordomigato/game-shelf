import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ collectionIds: z.array(z.uuid()).max(500) })

/**
 * Sets which of the user's collections a game is in: the whole set, so
 * leaving a collection out takes the game out of it. Its lists stay as they
 * are. Answers with the collections it's in.
 */
export default defineEventHandler(
  async (event): Promise<{ collectionIds: string[] }> => {
    const { sub } = await requireAuth(event)
    const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
    const { collectionIds } = await readValidatedBody(event, bodySchema.parse)
    const user = await findOrCreateUser(sub)
    return {
      collectionIds: await setItemCollections(
        user.id,
        id,
        collectionIds,
        userLimits(user),
      ),
    }
  },
)
