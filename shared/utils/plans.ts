/**
 * What each plan allows. Free is what everyone has today. Pro is planned
 * (see /pricing) and not on sale yet. Max is for the biggest collections,
 * arranged by email and set by hand. The server enforces these
 * (server/utils/limits.ts) and the app shows them where they apply, so a
 * limit never comes out of nowhere.
 *
 * Sized so a free shelf stays generous (about 2 MB of database at the
 * most) while one account, or one script, can't fill the free database
 * for everyone.
 */
export type Plan = 'free' | 'pro' | 'max'

export interface PlanLimits {
  /** Collections, not counting the Wishlist. */
  collections: number
  fieldsPerCollection: number
  gamesPerCollection: number
  /** Games across every collection (each game once). */
  games: number
  /** Characters in one text field. */
  textLength: number
  chartsPerCollection: number
  /** Rows in one CSV import. */
  importRows: number
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    collections: 10,
    fieldsPerCollection: 15,
    gamesPerCollection: 1000,
    games: 3000,
    textLength: 500,
    chartsPerCollection: 4,
    importRows: 1000,
  },
  // Planned. The text limit needs the per-plan check wired through value
  // validation (shared/utils/field-values.ts) when Pro goes on sale.
  pro: {
    collections: 100,
    fieldsPerCollection: 30,
    gamesPerCollection: 10_000,
    games: 25_000,
    textLength: 2000,
    chartsPerCollection: 20,
    importRows: 5000,
  },
  // By arrangement. Fields and charts stay at the app's own maximums.
  max: {
    collections: 500,
    fieldsPerCollection: 30,
    gamesPerCollection: 50_000,
    games: 100_000,
    textLength: 2000,
    chartsPerCollection: 24,
    importRows: 5000,
  },
}

/** Pro is planned: about this much a year, not on sale yet. */
export const PRO_PRICE_PER_YEAR = 5

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan]
}

/** The message the browser shows when the server refuses a change. */
export const LIMIT_REACHED: Record<keyof PlanLimits, { key: string }> = {
  collections: { key: 'limits.reached.collections' },
  fieldsPerCollection: { key: 'limits.reached.fieldsPerCollection' },
  gamesPerCollection: { key: 'limits.reached.gamesPerCollection' },
  games: { key: 'limits.reached.games' },
  textLength: { key: 'limits.reached.textLength' },
  chartsPerCollection: { key: 'limits.reached.chartsPerCollection' },
  importRows: { key: 'limits.reached.importRows' },
}
