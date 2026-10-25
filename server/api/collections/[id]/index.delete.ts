import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await authorize(
    event,
    'collection.delete',
    collectionOf(event),
  )
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  await deleteCollection(user.id, id)
  setResponseStatus(event, 204)
  return null
})
