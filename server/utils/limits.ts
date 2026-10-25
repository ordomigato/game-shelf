import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { createError } from 'h3'
import {
  type CustomLimits,
  limitsFor,
  normalizePlan,
  type Plan,
  type PlanLimits,
  type StoredPlan,
} from '../../shared/utils/plans'
import { collectionItems, collections, libraryItems, users } from '../db/schema'
import { assertOwnsCollections, collectionIdsForItem } from './collections'

/**
 * The plan a user has right now. A stored 'max' counts as Pro. A plan with
 * an end date that has passed counts as free (`plan_until` is unused for
 * now and stays null).
 */
export function effectivePlan(user: {
  plan: StoredPlan
  planUntil: Date | null
}): Plan {
  const plan = normalizePlan(user.plan)
  if (plan === 'free') return 'free'
  return user.planUntil && user.planUntil < new Date() ? 'free' : plan
}

/** The account's limits: its plan's, with any custom limits on top. */
export function userLimits(
  user: Parameters<typeof effectivePlan>[0] & {
    customLimits: CustomLimits | null
  },
): PlanLimits {
  return limitsFor(effectivePlan(user), user.customLimits)
}

/**
 * Refuses a change that would go past a plan limit. The browser shows
 * `data.key` with `data.params` (see app/utils/limit-message.ts).
 */

export function limitReached(limit: keyof PlanLimits, value: number): never {
  throw createError({
    statusCode: 403,
    statusMessage: 'Plan limit reached',
    data: { key: LIMIT_REACHED[limit].key, params: { limit: value } },
  })
}

/** Room for one more collection (Owned and the Wishlist aren't collections). */
export async function assertCollectionRoom(
  ownerId: string,
  limits: PlanLimits,
): Promise<void> {
  const [row] = await useDb()
    .select({ n: count() })
    .from(collections)
    .where(eq(collections.ownerId, ownerId))
  if ((row?.n ?? 0) >= limits.collections) {
    limitReached('collections', limits.collections)
  }
}

/**
 * Room for `adding` more games in each of these collections. Games already
 * in a collection don't need room, so pass only the ones being added.
 */
export async function assertCollectionsRoom(
  collectionIds: string[],
  adding: number,
  limits: PlanLimits,
): Promise<void> {
  if (!collectionIds.length || adding <= 0) return
  const rows = await useDb()
    .select({ id: collections.id, n: count(collectionItems.itemId) })
    .from(collections)
    .leftJoin(collectionItems, eq(collectionItems.collectionId, collections.id))
    .where(inArray(collections.id, collectionIds))
    .groupBy(collections.id)
  if (rows.some((row) => row.n + adding > limits.gamesPerCollection)) {
    limitReached('gamesPerCollection', limits.gamesPerCollection)
  }
}

/**
 * Room for `adding` more games in the library. The account's games limit
 * counts every library row, owned or wishlisted, and a game on both lists
 * counts once. Call it only when a new library row is created, never when a
 * game moves between lists or joins a collection.
 */
export async function assertLibraryRoom(
  ownerId: string,
  adding: number,
  limits: PlanLimits,
): Promise<void> {
  if (adding <= 0) return
  const [row] = await useDb()
    .select({ n: count() })
    .from(libraryItems)
    .where(eq(libraryItems.ownerId, ownerId))
  if ((row?.n ?? 0) + adding > limits.games) {
    limitReached('games', limits.games)
  }
}

/**
 * Refuses a new field once the account has as many as its plan allows. An
 * account that already has more (the plan changed, or fields were merged)
 * keeps them all and can still edit and remove them.
 */
export function assertFieldRoom(
  before: { id: string }[],
  after: { id: string }[],
  limits: PlanLimits,
): void {
  const known = new Set(before.map((field) => field.id))
  const adding = after.some((field) => !known.has(field.id))
  if (adding && after.length > limits.fields) {
    limitReached('fields', limits.fields)
  }
}

export function assertChartCount(charts: number, limits: PlanLimits): void {
  if (charts > limits.chartsPerCollection) {
    limitReached('chartsPerCollection', limits.chartsPerCollection)
  }
}

/** The user's counts, for Settings. `games` counts each game once. */
export async function usage(ownerId: string) {
  const db = useDb()
  const [[collectionRow], [library], [account]] = await Promise.all([
    db
      .select({ n: count() })
      .from(collections)
      .where(eq(collections.ownerId, ownerId)),
    db
      .select({
        games: sql<number>`count(*)::int`,
        owned: sql<number>`count(*) filter (where ${libraryItems.owned})::int`,
        wishlist: sql<number>`count(*) filter (where ${libraryItems.wishlisted})::int`,
      })
      .from(libraryItems)
      .where(eq(libraryItems.ownerId, ownerId)),
    db
      .select({ fields: users.fields })
      .from(users)
      .where(eq(users.id, ownerId)),
  ])
  return {
    collections: collectionRow?.n ?? 0,
    games: library?.games ?? 0,
    owned: library?.owned ?? 0,
    wishlist: library?.wishlist ?? 0,
    fields: account?.fields.length ?? 0,
  }
}

/**
 * Room to put a game into these collections: in each collection it isn't
 * already in. The collections must be the user's (404), which is checked first so a
 * stranger's collection never answers with a limit.
 */
export async function assertRoomToAdd(
  ownerId: string,
  itemId: string | null,
  collectionIds: string[],
  limits: PlanLimits,
): Promise<void> {
  await assertOwnsCollections(ownerId, collectionIds)
  const already = itemId ? await collectionIdsForItem(itemId) : []
  await assertCollectionsRoom(
    collectionIds.filter((id) => !already.includes(id)),
    1,
    limits,
  )
}

/** The user's item for an IGDB game, if they have one. */
export async function itemIdForIgdb(
  ownerId: string,
  igdbId: number | null,
): Promise<string | null> {
  if (igdbId === null) return null
  const [row] = await useDb()
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(
      and(eq(libraryItems.ownerId, ownerId), eq(libraryItems.igdbId, igdbId)),
    )
  return row?.id ?? null
}
