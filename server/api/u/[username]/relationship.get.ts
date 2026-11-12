import { z } from 'zod'
import type { Relationship } from '../../../../shared/types/follows'

const paramsSchema = z.object({ username: z.string().max(20) })

/**
 * How the signed-in viewer stands with this account. Kept apart from the
 * public profile, which is the same for everyone.
 */
export default defineEventHandler(async (event): Promise<Relationship> => {
  const { user } = await authorize(event, 'follow.write')
  const { username } = await getValidatedRouterParams(event, paramsSchema.parse)
  const target = await accountNamed(username)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return relationshipWith(user.id, target.id)
})
