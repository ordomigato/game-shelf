import type { Me } from '../../shared/types/user'

export default defineEventHandler(async (event): Promise<Me> => {
  const { sub } = await requireAuth(event)
  return toMe(await findOrCreateUser(sub))
})
