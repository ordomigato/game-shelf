import { MAX_CHARTS } from './charts'
import { MAX_IMPORT_ROWS } from './csv-import'
import { MAX_FIELDS } from './field-changes'

/** The longest text a field can hold, whatever an account's limits say. */
const MAX_TEXT_LENGTH = 2000

/**
 * What each plan allows. Free is what everyone has. Pro is free too: it is
 * granted by hand on request, and its limits can be raised further per
 * account with `users.custom_limits`. Nothing is charged. The server
 * enforces these (server/utils/limits.ts) and the app shows them where
 * they apply, so a limit never comes out of nowhere.
 *
 * Free matches Pro on collections, charts, games per collection and
 * fields. Total games and text length are what bound one account, or one
 * script, filling the database: at most 3,000 games x 20 fields x 500
 * characters, about 30 MB. That is why those two stay low.
 */
export type Plan = 'free' | 'pro'

/**
 * What the `users.plan` column can hold. The `users_plan` check still
 * allows 'max', which the app treats as Pro (see `normalizePlan`). A later
 * migration should map 'max' to 'pro' and tighten that check.
 */
export type StoredPlan = Plan | 'max'

/** The plan the app works with for a stored value. */
export function normalizePlan(stored: string | null | undefined): Plan {
  return stored === 'pro' || stored === 'max' ? 'pro' : 'free'
}

export interface PlanLimits {
  /** Collections, not counting Owned and the Wishlist. */
  collections: number
  /** Extra fields per game, kept on the account for all its games. */
  fields: number
  /** Games in one collection. */
  gamesPerCollection: number
  /** Games in the library: owned or wishlisted, a game on both counting once. */
  games: number
  /** Characters in one text field. */
  textLength: number
  chartsPerCollection: number
  /** Rows in one CSV import. */
  importRows: number
}

/** Limits set by hand for one account, on top of its plan's. */
export type CustomLimits = Partial<PlanLimits>

export const PLAN_LIMITS: Record<'free' | 'pro', PlanLimits> = {
  free: {
    collections: 100,
    fields: 20,
    gamesPerCollection: 1000,
    games: 3000,
    textLength: 500,
    chartsPerCollection: 20,
    importRows: 1000,
  },
  pro: {
    collections: 100,
    fields: 20,
    gamesPerCollection: 1000,
    games: 10_000,
    textLength: 2000,
    chartsPerCollection: 20,
    importRows: 5000,
  },
}

/** What the app itself supports, whatever an account's limits say. */
const APP_MAXIMUMS: Partial<PlanLimits> = {
  fields: MAX_FIELDS,
  // A full collection is sent in one response, which Lambda caps at 6 MB.
  gamesPerCollection: 1000,
  games: 10_000,
  textLength: MAX_TEXT_LENGTH,
  chartsPerCollection: MAX_CHARTS,
  importRows: MAX_IMPORT_ROWS,
}

/**
 * An account's limits: its plan's, overridden by any custom limits set on
 * the account, never past what the app supports. A stored 'max' counts as
 * Pro.
 */
export function limitsFor(
  plan: StoredPlan,
  custom?: CustomLimits | null,
): PlanLimits {
  const merged: PlanLimits = {
    ...PLAN_LIMITS[normalizePlan(plan)],
    ...Object.fromEntries(
      Object.entries(custom ?? {}).filter(
        ([key, value]) =>
          key in PLAN_LIMITS.free && typeof value === 'number' && value >= 0,
      ),
    ),
  }
  for (const [key, max] of Object.entries(APP_MAXIMUMS)) {
    const name = key as keyof PlanLimits
    merged[name] = Math.min(merged[name], max!)
  }
  return merged
}

/** The message the browser shows when the server refuses a change. */
export const LIMIT_REACHED: Record<keyof PlanLimits, { key: string }> = {
  collections: { key: 'limits.reached.collections' },
  fields: { key: 'limits.reached.fields' },
  gamesPerCollection: { key: 'limits.reached.gamesPerCollection' },
  games: { key: 'limits.reached.games' },
  textLength: { key: 'limits.reached.textLength' },
  chartsPerCollection: { key: 'limits.reached.chartsPerCollection' },
  importRows: { key: 'limits.reached.importRows' },
}
