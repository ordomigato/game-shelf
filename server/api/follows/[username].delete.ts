import { z } from 'zod'

const paramsSchema = z.object({ username: z.string().max(20) })

/** Stops following an account. Idempotent. */
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'follow.write')
  const { username } = await getValidatedRouterParams(event, paramsSchema.parse)
  const target = await accountNamed(username)
  await unfollowUser(user.id, target.id)
  log('info', 'follow.remove')
  setResponseStatus(event, 204)
  return null
})
