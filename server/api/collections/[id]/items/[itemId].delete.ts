import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid(), itemId: z.uuid() })

/**
 * Takes an item out of one collection. It stays in the user's library and
 * their other collections. "Got it" on the Wishlist uses this.
 */
export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const { id, itemId } = await getValidatedRouterParams(
    event,
    paramsSchema.parse,
  )
  const user = await findOrCreateUser(sub)
  await getOwnedCollection(user.id, id)
  await removeItemFromCollection(id, itemId)
  setResponseStatus(event, 204)
  return null
})
