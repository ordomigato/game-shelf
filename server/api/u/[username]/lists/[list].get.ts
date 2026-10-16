import { z } from 'zod'
import type { ListDetail } from '../../../../../shared/types/collection'

const paramsSchema = z.object({
  username: z.string().max(20),
  list: z.enum(['owned', 'wishlist']),
})

/**
 * Owned or the Wishlist at `/u/<username>/shelf/<list>`. Only the owner
 * sees them. Anyone else gets a 404, like a private collection.
 */
export default defineEventHandler(async (event): Promise<ListDetail> => {
  const { username, list } = await getValidatedRouterParams(
    event,
    paramsSchema.parse,
  )
  const [owner, claims] = await Promise.all([
    findUserByUsername(username),
    optionalAuth(event),
  ])
  if (!owner || claims?.sub !== owner.cognitoSub) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return getList(owner.id, list)
})
