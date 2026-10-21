import type { ListCounts } from '../../../shared/types/collection'

/** How many games the signed-in user has on each list, and in all. */
export default defineEventHandler(async (event): Promise<ListCounts> => {
  const { sub } = await requireAuth(event)
  const user = await findOrCreateUser(sub)
  return listCounts(user.id)
})
