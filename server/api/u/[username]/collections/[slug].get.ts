import { z } from 'zod'
import type { CollectionDetail } from '../../../../../shared/types/collection'

const paramsSchema = z.object({
  username: z.string().max(20),
  slug: z.string().max(60),
})

/**
 * One collection by its address, `/u/<username>/shelf/<slug>`. The owner
 * always sees it. Anyone else sees it only when it's public. Otherwise it's
 * a 404, so a private collection's existence isn't revealed.
 */
export default defineEventHandler(async (event): Promise<CollectionDetail> => {
  const { username, slug } = await getValidatedRouterParams(
    event,
    paramsSchema.parse,
  )
  const [owner, claims] = await Promise.all([
    findUserByUsername(username),
    optionalAuth(event),
  ])
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return getCollectionBySlug(owner.id, slug, claims?.sub === owner.cognitoSub)
})
