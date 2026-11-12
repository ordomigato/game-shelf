import { z } from 'zod'
import type { FollowCounts } from '../../../../shared/types/follows'

const paramsSchema = z.object({ username: z.string().max(20) })

/**
 * How many accounts this account follows and is followed by. The owner
 * counts everyone. Anyone else counts only what the lists show them, and
 * gets a 404 when the owner turned follow lists off.
 */
export default defineEventHandler(async (event): Promise<FollowCounts> => {
  const { username } = await getValidatedRouterParams(event, paramsSchema.parse)
  const [owner, viewer] = await Promise.all([
    findUserByUsername(username),
    viewerOf(event),
  ])
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  assertCan(viewer, 'follows.read', followsResource(owner))
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return followCounts(owner, viewer?.id ?? null)
})
