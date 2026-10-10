import { z } from 'zod'
import type { CollectionSummary } from '../../../../../shared/types/collection'

const paramsSchema = z.object({ username: z.string().max(20) })

/**
 * A user's collections: all of them for the owner, only public ones for
 * anyone else. An unknown username is a 404.
 */
export default defineEventHandler(
  async (event): Promise<CollectionSummary[]> => {
    const { username } = await getValidatedRouterParams(
      event,
      paramsSchema.parse,
    )
    const [owner, claims] = await Promise.all([
      findUserByUsername(username),
      optionalAuth(event),
    ])
    if (!owner)
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    const isOwner = claims?.sub === owner.cognitoSub
    if (isOwner) await ensureWishlist(owner.id)
    return listCollections(owner.id, { publicOnly: !isOwner })
  },
)
