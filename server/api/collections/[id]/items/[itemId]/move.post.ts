import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid(), itemId: z.uuid() })
const bodySchema = z.object({
  /** Where the game goes. It leaves this collection. */
  toCollectionIds: z.array(z.uuid()).min(1).max(50),
})

/** Moves a game to other collections, like "Got it" from the Wishlist. */
export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const { id, itemId } = await getValidatedRouterParams(
    event,
    paramsSchema.parse,
  )
  const { toCollectionIds } = await readValidatedBody(event, bodySchema.parse)
  const user = await findOrCreateUser(sub)
  await moveItemToCollections(user.id, id, itemId, toCollectionIds)
  setResponseStatus(event, 204)
  return null
})
