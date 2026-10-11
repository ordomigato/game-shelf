import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  /** The pinned collection to place it after: null for the top, left out for the bottom. */
  afterCollectionId: z.uuid().nullable().optional(),
})

/** Pins a collection to the user's sidebar, or moves its pin. */
export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { afterCollectionId } = await readValidatedBody(event, bodySchema.parse)
  const user = await findOrCreateUser(sub)
  return pinCollection(user.id, id, afterCollectionId)
})
