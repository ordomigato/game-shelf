import { z } from 'zod'
import type { PublicProfile } from '../../../../shared/types/user'

const paramsSchema = z.object({ username: z.string().max(20) })

/** What anyone can see about a user. An unknown username is a 404. */
export default defineEventHandler(async (event): Promise<PublicProfile> => {
  const { username } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await findUserByUsername(username)
  if (!user?.username) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return toPublicProfile(user)
})
