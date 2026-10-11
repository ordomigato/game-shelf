import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })

/** Unpins a collection from the user's sidebar. */
export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await findOrCreateUser(sub)
  await unpinCollection(user.id, id)
  setResponseStatus(event, 204)
  return null
})
