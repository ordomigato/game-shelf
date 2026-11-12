import { z } from 'zod'

const paramsSchema = z.object({ username: z.string().max(20) })

/** Unblocks an account. Follows that blocking ended are not restored. Idempotent. */
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'block.write')
  const { username } = await getValidatedRouterParams(event, paramsSchema.parse)
  const target = await accountNamed(username)
  await unblockUser(user.id, target.id)
  log('info', 'block.remove')
  setResponseStatus(event, 204)
  return null
})
