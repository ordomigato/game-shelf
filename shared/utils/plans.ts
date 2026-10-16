import { MAX_CHARTS } from './charts'
import { MAX_IMPORT_ROWS } from './csv-import'
import { MAX_FIELDS } from './field-changes'

/**
 * What each plan allows. Free is what everyone has today. Pro is planned
 * (see /pricing) and not on sale yet. Max is custom: limits agreed by
 * email and stored on the account (`users.custom_limits`). The server
 * enforces these (server/utils/limits.ts) and the app shows them where
 * they apply, so a limit never comes out of nowhere.
 *
 * Sized so a free shelf stays generous (about 2 MB of database at the
 * most) while one account, or one script, can't fill the free database
 * for everyone.
 */
export type Plan = 'free' | 'pro' | 'max'

export interface PlanLimits {
  /** Collections, not counting Owned and the Wishlist. */
  collections: number
  fieldsPerCollection: number
  /** Games in one collection, and on the Wishlist. */
  gamesPerCollection: number
  /** Games owned or wishlisted (each game once). */
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
}

/** Pro is planned and not on sale yet. */
export const PRO_PRICE_PER_YEAR = 5

/** What the app itself supports, whatever an account's limits say. */
const APP_MAXIMUMS: Partial<PlanLimits> = {
  fieldsPerCollection: MAX_FIELDS,
  chartsPerCollection: MAX_CHARTS,
  importRows: MAX_IMPORT_ROWS,
}

/**
 * An account's limits: its plan's (Max starts from Pro's), overridden by
 * any custom limits set on the account, never past what the app supports.
 */
export function limitsFor(
  plan: Plan,
  custom?: CustomLimits | null,
): PlanLimits {
  const merged: PlanLimits = {
    ...PLAN_LIMITS[plan === 'free' ? 'free' : 'pro'],
    ...Object.fromEntries(
      Object.entries(custom ?? {}).filter(
        ([, value]) => typeof value === 'number' && value >= 0,
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
  fieldsPerCollection: { key: 'limits.reached.fieldsPerCollection' },
  gamesPerCollection: { key: 'limits.reached.gamesPerCollection' },
  games: { key: 'limits.reached.games' },
  textLength: { key: 'limits.reached.textLength' },
  chartsPerCollection: { key: 'limits.reached.chartsPerCollection' },
  importRows: { key: 'limits.reached.importRows' },
}
