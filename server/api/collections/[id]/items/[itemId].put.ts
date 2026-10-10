import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid(), itemId: z.uuid() })

/** Adds one of the user's library items to one of their collections. */
export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const { id, itemId } = await getValidatedRouterParams(
    event,
    paramsSchema.parse,
  )
  const user = await findOrCreateUser(sub)
  await getOwnedItem(user.id, itemId)
  await addItemToCollections(user.id, itemId, [id])
  setResponseStatus(event, 204)
  return null
})
