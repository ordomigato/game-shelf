import type { BlockedAccount } from '../../../shared/types/follows'

/** The accounts the signed-in user has blocked, for Settings. */
export default defineEventHandler(async (event): Promise<BlockedAccount[]> => {
  const { user } = await authorize(event, 'account.read')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return listBlocked(user.id)
})
