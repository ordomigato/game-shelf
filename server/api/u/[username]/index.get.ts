import { z } from 'zod'
import type { PublicProfile } from '../../../../shared/types/user'

const paramsSchema = z.object({ username: z.string().max(20) })

/**
 * What a viewer can see about a user. An unknown username is a 404. The
 * follow counts and the viewer's relationship depend on who asks, so the
 * answer is never cached.
 */
export default defineEventHandler(async (event): Promise<PublicProfile> => {
  const { username } = await getValidatedRouterParams(event, paramsSchema.parse)
  const [user, viewer] = await Promise.all([
    findUserByUsername(username),
    viewerOf(event),
  ])
  if (!user?.username) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { ...toPublicProfile(user), ...(await followState(user, viewer)) }
})
