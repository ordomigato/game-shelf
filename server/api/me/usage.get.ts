import type { PlanUsage } from '../../../shared/types/user'

/** How much of their plan the signed-in user has used. */
export default defineEventHandler(async (event): Promise<PlanUsage> => {
  const { sub } = await requireAuth(event)
  const user = await findOrCreateUser(sub)
  return { plan: effectivePlan(user), ...(await usage(user.id)) }
})
