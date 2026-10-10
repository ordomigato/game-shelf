import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid(), itemId: z.uuid() })
const bodySchema = z.object({
  /** The item to place it after, or null for the top of the collection. */
  afterItemId: z.uuid().nullable(),
})

/** Moves a game within one of the user's collections. */
export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const { id, itemId } = await getValidatedRouterParams(
    event,
    paramsSchema.parse,
  )
  const { afterItemId } = await readValidatedBody(event, bodySchema.parse)
  const user = await findOrCreateUser(sub)
  await moveItemInCollection(user.id, id, itemId, afterItemId)
  setResponseStatus(event, 204)
  return null
})
