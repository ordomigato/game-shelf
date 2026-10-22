import type { Role } from '../utils/access'
import type { Plan, PlanLimits } from '../utils/plans'

/** The signed-in user, as returned by `/api/me`. */
export interface Me {
  id: string
  /** Null until chosen on the welcome screen. */
  username: string | null
  displayName: string | null
  createdAt: string
  /** The plan in effect now (a paid plan that ended counts as free). */
  plan: Plan
  /** The limits in effect: the plan's, with any custom limits on top. */
  limits: PlanLimits
  /** The roles this account holds (always including "user"). Never on public data. */
  roles: Role[]
}

/** How much of their plan a user has used, for Settings. */
export interface PlanUsage {
  plan: Plan
  /** Collections, not counting Owned and the Wishlist. */
  collections: number
  /** Games owned or wishlisted, each counted once. */
  games: number
  /** Games owned. */
  owned: number
  /** Games on the Wishlist. */
  wishlist: number
  /** Extra fields kept for games. */
  fields: number
}

/** What anyone can see about a user, on their shelf. */
export interface PublicProfile {
  username: string
  displayName: string | null
  /** When they joined, as an ISO timestamp. */
  memberSince: string
}
