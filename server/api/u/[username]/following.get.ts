import { z } from 'zod'
import type { FollowPage } from '../../../../shared/types/follows'

const paramsSchema = z.object({ username: z.string().max(20) })
const querySchema = z.object({
  cursor: z.string().max(200).optional(),
})

/**
 * The accounts this account follows, newest first, 50 at a time. A 404 for
 * everyone but the owner when they turned follow lists off. Leaves out
 * accounts that turned theirs off, except for the owner's own view.
 */
export default defineEventHandler(async (event): Promise<FollowPage> => {
  const { username } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { cursor } = await getValidatedQuery(event, querySchema.parse)
  const [owner, viewer] = await Promise.all([
    findUserByUsername(username),
    viewerOf(event),
  ])
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  assertCan(viewer, 'follows.read', followsResource(owner))
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return followPage({
    kind: 'following',
    owner,
    viewerId: viewer?.id ?? null,
    cursor: cursor ?? null,
  })
})
