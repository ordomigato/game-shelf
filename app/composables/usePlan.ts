import { limitsFor } from '#shared/utils/plans'

/** The signed-in user's plan and its limits (free until /api/me says). */
export function usePlan() {
  const auth = useAuth()
  const plan = computed(() => auth.me.value?.plan ?? 'free')
  const limits = computed(() => limitsFor(plan.value))
  return { plan, limits }
}
