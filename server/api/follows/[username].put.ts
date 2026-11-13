import { z } from 'zod'

const paramsSchema = z.object({ username: z.string().max(20) })

/**
 * Follows an account. Idempotent, and 204 either way. An account that blocked
 * the caller looks the same as one that did not, but nothing is stored.
 * Needs a username of your own, refuses yourself, and is limited to 60 a
 * hour and 2,000 followed accounts.
 */
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'follow.write')
  const { username } = await getValidatedRouterParams(event, paramsSchema.parse)
  await rateLimit(event, `follow:${user.id}`, {
    limit: FOLLOWS_PER_HOUR,
    windowSeconds: 3600,
  })
  if (!user.username) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a username' })
  }
  const target = await accountNamed(username)
  const outcome = await followUser(user.id, target.id)
  log('info', 'follow.add', { outcome })
  setResponseStatus(event, 204)
  return null
})
