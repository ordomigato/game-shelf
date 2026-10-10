import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await findOrCreateUser(sub)
  await deleteCollection(user.id, id)
  setResponseStatus(event, 204)
  return null
})
