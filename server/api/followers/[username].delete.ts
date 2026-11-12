import { z } from 'zod'

const paramsSchema = z.object({ username: z.string().max(20) })

/** Ends an account's follow of the signed-in user. They can follow again. Idempotent. */
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'follower.remove')
  const { username } = await getValidatedRouterParams(event, paramsSchema.parse)
  const follower = await accountNamed(username)
  await removeFollower(user.id, follower.id)
  log('info', 'follower.remove')
  setResponseStatus(event, 204)
  return null
})
