import { z } from 'zod'
import type { ListSummary } from '../../../../../shared/types/collection'

const paramsSchema = z.object({ username: z.string().max(20) })

/**
 * A user's Owned and Wishlist for their shelf page: both for the owner,
 * only the public ones for anyone else. An unknown username is a 404.
 */
export default defineEventHandler(async (event): Promise<ListSummary[]> => {
  const { username } = await getValidatedRouterParams(event, paramsSchema.parse)
  const [owner, viewer] = await Promise.all([
    findUserByUsername(username),
    viewerOf(event),
  ])
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return listSummaries(owner, viewer)
})
