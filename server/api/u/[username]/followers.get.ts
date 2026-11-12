import { z } from 'zod'
import type { FollowPage } from '../../../../shared/types/follows'

const paramsSchema = z.object({ username: z.string().max(20) })
const querySchema = z.object({
  cursor: z.string().regex(CURSOR_PATTERN).optional(),
})

/**
 * The accounts that follow this account, newest first, 50 at a time, with
 * the viewer's mutuals marked. The same rules as the Following list.
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
    kind: 'followers',
    owner,
    viewerId: viewer?.id ?? null,
    cursor: cursor ?? null,
  })
})
