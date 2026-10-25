import type { Me } from '../../shared/types/user'

export default defineEventHandler(async (event): Promise<Me> => {
  const { user } = await authorize(event, 'account.read')
  return toMe(user)
})
