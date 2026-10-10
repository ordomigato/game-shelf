import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { libraryItems } from '../../db/schema'

const paramsSchema = z.object({ id: z.uuid() })

/** Removes a game from the user's library and every collection it's in. */
export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await findOrCreateUser(sub)
  await getOwnedItem(user.id, id)
  await useDb().delete(libraryItems).where(eq(libraryItems.id, id))
  setResponseStatus(event, 204)
  return null
})
