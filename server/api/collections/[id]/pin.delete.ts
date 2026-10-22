import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })

/** Unpins a collection from the user's sidebar. */
export default defineEventHandler(async (event) => {
  const { user } = await authorize(
    event,
    'collection.update',
    collectionOf(event),
  )
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  await unpinCollection(user.id, id)
  setResponseStatus(event, 204)
  return null
})
