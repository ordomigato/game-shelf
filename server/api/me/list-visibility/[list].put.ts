import { z } from 'zod'

const paramsSchema = z.object({ list: z.enum(['owned', 'wishlist']) })
const bodySchema = z.object({ visibility: z.enum(['private', 'public']) })

/** Makes the signed-in user's Owned or Wishlist private or public. */
export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const { list } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { visibility } = await readValidatedBody(event, bodySchema.parse)
  const user = await findOrCreateUser(sub)
  await setListVisibility(user.id, list, visibility)
  return { list, visibility }
})
