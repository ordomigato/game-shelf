import { z } from 'zod'

const paramsSchema = z.object({ username: z.string().max(20) })

/**
 * Blocks an account and ends the follows between the two, both ways. The
 * account is not told. Idempotent.
 */
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'block.write')
  const { username } = await getValidatedRouterParams(event, paramsSchema.parse)
  const target = await accountNamed(username)
  await blockUser(user.id, target.id)
  log('info', 'block.add')
  setResponseStatus(event, 204)
  return null
})
