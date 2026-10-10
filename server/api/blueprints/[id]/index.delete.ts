import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })

/** Deletes one of the user's blueprints. Refused while a collection uses it. */
export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await findOrCreateUser(sub)
  await deleteBlueprint(user.id, id)
  setResponseStatus(event, 204)
  return null
})
