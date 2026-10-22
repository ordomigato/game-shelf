import type { PlanUsage } from '../../../shared/types/user'

/** How much of their plan the signed-in user has used. */
export default defineEventHandler(async (event): Promise<PlanUsage> => {
  const { user } = await authorize(event, 'account.read')
  return { plan: effectivePlan(user), ...(await usage(user.id)) }
})
