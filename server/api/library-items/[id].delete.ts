import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { libraryItems } from '../../db/schema'

const paramsSchema = z.object({ id: z.uuid() })

/** Removes a game from the user's library: both lists and every collection. */
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'library.write', itemOf(event))
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  await getOwnedItem(user.id, id)
  await useDb().delete(libraryItems).where(eq(libraryItems.id, id))
  setResponseStatus(event, 204)
  return null
})
