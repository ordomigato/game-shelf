import { and, count, desc, eq, gt, isNotNull, lt, or, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { Resource } from '../../shared/utils/access'
import type {
  BlockedAccount,
  FollowCounts,
  FollowPage,
  FollowUpdate,
  Relationship,
} from '../../shared/types/follows'
import { blocks, follows, users } from '../db/schema'
import { findUserByUsername } from './users'

type UserRow = typeof users.$inferSelect

export const MAX_FOLLOWING = 2000
export const MAX_BLOCKS = 500
export const FOLLOWS_PER_HOUR = 60
export const FOLLOW_PAGE_SIZE = 50
export const UPDATES_LIMIT = 10
export const UPDATES_DAYS = 30

/**
 * The timestamp of a follow row as Postgres prints it, which keeps the
 * microseconds a JavaScript date would lose. A page's `next` cursor is the
 * last row's, and the next page starts before it.
 */
export const CURSOR_PATTERN =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/

/** What the policy needs to decide who may read an account's follow lists. */
export function followsResource(
  owner: Pick<UserRow, 'id' | 'followsPublic'>,
): Resource {
  return {
    ownerId: owner.id,
    visibility: owner.followsPublic ? 'public' : 'private',
  }
}

/** The account a follow or block names, or a 404 if no one has that username. */
export async function accountNamed(username: string): Promise<UserRow> {
  const found = await findUserByUsername(username)
  if (!found?.username) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return found
}

const badRequest = (message: string) =>
  createError({ statusCode: 400, statusMessage: message })

interface RelationRow extends Record<string, unknown> {
  following: boolean
  followed_by: boolean
  blocking: boolean
  blocked_by: boolean
  total: number
}

async function relationRow(
  viewerId: string,
  targetId: string,
): Promise<RelationRow> {
  const result = await useDb().execute<RelationRow>(sql`
    select
      exists (select 1 from follows as f
        where f.follower_id = ${viewerId}::uuid and f.followee_id = ${targetId}::uuid) as following,
      exists (select 1 from follows as f
        where f.follower_id = ${targetId}::uuid and f.followee_id = ${viewerId}::uuid) as followed_by,
      exists (select 1 from blocks as b
        where b.blocker_id = ${viewerId}::uuid and b.blocked_id = ${targetId}::uuid) as blocking,
      exists (select 1 from blocks as b
        where b.blocker_id = ${targetId}::uuid and b.blocked_id = ${viewerId}::uuid) as blocked_by,
      (select count(*)::int from follows as f
        where f.follower_id = ${viewerId}::uuid) as total`)
  return result.rows[0]!
}

/** How the viewer stands with an account. Never says whether they are blocked by it. */
export async function relationshipWith(
  viewerId: string,
  targetId: string,
): Promise<Relationship> {
  const row = await relationRow(viewerId, targetId)
  return {
    following: row.following,
    followedBy: row.followed_by,
    blocking: row.blocking,
  }
}

/**
 * What a follow did: `followed` stored it, `already` found it stored, and
 * `ignored` is a follow of an account that blocked the follower, which
 * looks the same to them but stores nothing.
 */
export type FollowOutcome = 'followed' | 'already' | 'ignored'

/** Follows an account. Idempotent. Refuses yourself, 2,000 follows, and accounts you blocked. */
export async function followUser(
  followerId: string,
  targetId: string,
): Promise<FollowOutcome> {
  if (followerId === targetId) throw badRequest('Cannot follow yourself')
  const state = await relationRow(followerId, targetId)
  if (state.blocking) {
    throw createError({ statusCode: 409, statusMessage: 'Unblock first' })
  }
  if (state.blocked_by) return 'ignored'
  if (state.following) return 'already'
  if (state.total >= MAX_FOLLOWING) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Following limit reached',
      data: { key: 'follows.limitReached', params: { limit: MAX_FOLLOWING } },
    })
  }
  await useDb()
    .insert(follows)
    .values({ followerId, followeeId: targetId })
    .onConflictDoNothing()
  return 'followed'
}

/** Stops following. Idempotent. */
export async function unfollowUser(
  followerId: string,
  targetId: string,
): Promise<void> {
  await useDb()
    .delete(follows)
    .where(
      and(eq(follows.followerId, followerId), eq(follows.followeeId, targetId)),
    )
}

/** Ends someone's follow of the owner. Only the owner's own followers. Idempotent. */
export async function removeFollower(
  ownerId: string,
  followerId: string,
): Promise<void> {
  await useDb()
    .delete(follows)
    .where(
      and(eq(follows.followeeId, ownerId), eq(follows.followerId, followerId)),
    )
}

/** Blocks an account and ends the follows between the two, both ways, together. */
export async function blockUser(
  blockerId: string,
  targetId: string,
): Promise<void> {
  if (blockerId === targetId) throw badRequest('Cannot block yourself')
  const db = useDb()
  const [row] = await db
    .select({ n: count() })
    .from(blocks)
    .where(eq(blocks.blockerId, blockerId))
  if ((row?.n ?? 0) >= MAX_BLOCKS) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Block limit reached',
      data: { key: 'follows.blockLimitReached', params: { limit: MAX_BLOCKS } },
    })
  }
  await db.batch([
    db
      .insert(blocks)
      .values({ blockerId, blockedId: targetId })
      .onConflictDoNothing(),
    db
      .delete(follows)
      .where(
        or(
          and(
            eq(follows.followerId, blockerId),
            eq(follows.followeeId, targetId),
          ),
          and(
            eq(follows.followerId, targetId),
            eq(follows.followeeId, blockerId),
          ),
        ),
      ),
  ])
}

/** Unblocks an account. Restores no follows. Idempotent. */
export async function unblockUser(
  blockerId: string,
  targetId: string,
): Promise<void> {
  await useDb()
    .delete(blocks)
    .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, targetId)))
}

/** The accounts a user has blocked, newest first. */
export async function listBlocked(
  blockerId: string,
): Promise<BlockedAccount[]> {
  const rows = await useDb()
    .select({
      username: users.username,
      displayName: users.displayName,
      since: blocks.createdAt,
    })
    .from(blocks)
    .innerJoin(users, eq(users.id, blocks.blockedId))
    .where(and(eq(blocks.blockerId, blockerId), isNotNull(users.username)))
    .orderBy(desc(blocks.createdAt))
    .limit(MAX_BLOCKS)
  return rows.map((row) => ({
    username: row.username!,
    displayName: row.displayName,
    since: row.since.toISOString(),
  }))
}

type Direction = 'following' | 'followers'

/** The follow column that names the list's owner, and the one that names each row. */
const columnsOf = (kind: Direction) =>
  kind === 'following'
    ? { owner: follows.followerId, row: follows.followeeId }
    : { owner: follows.followeeId, row: follows.followerId }

/**
 * The accounts on an owner's Following or Followers list. Everyone but the
 * owner sees only the accounts that show their own lists (`showHidden`
 * false), so an account that turned the switch off never appears on
 * someone else's list.
 */
export function followRowsQuery(input: {
  kind: Direction
  ownerId: string
  viewerId: string | null
  showHidden: boolean
  cursor: string | null
}) {
  const { owner, row } = columnsOf(input.kind)
  const viewer = input.viewerId
  return useDb()
    .select({
      username: users.username,
      displayName: users.displayName,
      since: sql<string>`${follows.createdAt}::text`,
      viewerFollows: viewer
        ? sql<boolean>`exists (select 1 from follows as vf
            where vf.follower_id = ${viewer}::uuid and vf.followee_id = users.id)`
        : sql<boolean>`false`,
      followsViewer: viewer
        ? sql<boolean>`exists (select 1 from follows as vf
            where vf.follower_id = users.id and vf.followee_id = ${viewer}::uuid)`
        : sql<boolean>`false`,
      isYou: viewer
        ? sql<boolean>`users.id = ${viewer}::uuid`
        : sql<boolean>`false`,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, row))
    .where(
      and(
        eq(owner, input.ownerId),
        isNotNull(users.username),
        input.showHidden ? undefined : eq(users.followsPublic, true),
        input.cursor
          ? lt(follows.createdAt, sql`${input.cursor}::timestamptz`)
          : undefined,
      ),
    )
    .orderBy(desc(follows.createdAt))
    .limit(FOLLOW_PAGE_SIZE + 1)
}

/** One page of an owner's Following or Followers list, for this viewer. */
export async function followPage(input: {
  kind: Direction
  owner: Pick<UserRow, 'id'>
  viewerId: string | null
  cursor: string | null
}): Promise<FollowPage> {
  const rows = await followRowsQuery({
    kind: input.kind,
    ownerId: input.owner.id,
    viewerId: input.viewerId,
    showHidden: input.viewerId === input.owner.id,
    cursor: input.cursor,
  })
  const page = rows.slice(0, FOLLOW_PAGE_SIZE)
  return {
    items: page.map((row) => ({
      username: row.username!,
      displayName: row.displayName,
      following: row.viewerFollows,
      followsYou: row.followsViewer,
      mutual: row.viewerFollows && row.followsViewer,
      isYou: row.isYou,
    })),
    next: rows.length > FOLLOW_PAGE_SIZE ? page[page.length - 1]!.since : null,
  }
}

/**
 * How many accounts an owner follows and is followed by, as this viewer
 * sees the lists: the owner counts everyone, anyone else only the accounts
 * their lists would show.
 */
export async function followCounts(
  owner: Pick<UserRow, 'id'>,
  viewerId: string | null,
): Promise<FollowCounts> {
  const showHidden = viewerId === owner.id
  const countOf = async (kind: Direction) => {
    const { owner: ownerColumn, row } = columnsOf(kind)
    const [found] = await useDb()
      .select({ n: count() })
      .from(follows)
      .innerJoin(users, eq(users.id, row))
      .where(
        and(
          eq(ownerColumn, owner.id),
          isNotNull(users.username),
          showHidden ? undefined : eq(users.followsPublic, true),
        ),
      )
    return found?.n ?? 0
  }
  const [following, followers] = await Promise.all([
    countOf('following'),
    countOf('followers'),
  ])
  return { following, followers }
}

/** Followers who arrived since the owner last opened their Followers list. */
export async function countNewFollowers(
  user: Pick<UserRow, 'id' | 'followersSeenAt'>,
): Promise<number> {
  const [found] = await useDb()
    .select({ n: count() })
    .from(follows)
    .where(
      and(
        eq(follows.followeeId, user.id),
        user.followersSeenAt
          ? gt(follows.createdAt, user.followersSeenAt)
          : undefined,
      ),
    )
  return found?.n ?? 0
}

/** Marks every follower so far as seen, which clears the "new" dot. */
export async function markFollowersSeen(ownerId: string): Promise<void> {
  await useDb()
    .update(users)
    .set({ followersSeenAt: new Date() })
    .where(eq(users.id, ownerId))
}

/** Whether the viewer follows anyone at all. */
export async function followsAnyone(viewerId: string): Promise<boolean> {
  const [found] = await useDb()
    .select({ n: count() })
    .from(follows)
    .where(eq(follows.followerId, viewerId))
  return (found?.n ?? 0) > 0
}

interface UpdateRow extends Record<string, unknown> {
  username: string
  display_name: string | null
  kind: FollowUpdate['kind']
  title: string | null
  slug: string | null
  updated_at: string | Date
}

/**
 * The newest changes since `since` by accounts the viewer follows, from
 * public collections and public Owned and Wishlist lists only. Private
 * things are left out in each part of the query, so nothing depends on
 * the shaping that comes after it. A collection counts as changed when it
 * was edited or a game was added to it. Names in the subqueries are
 * spelled out on purpose (see the postgres-change skill).
 */
export function updatesQuery(viewerId: string, since: Date) {
  return sql`
    select changes.* from (
      select u.username, u.display_name, 'collection'::text as kind,
        c.title, c.slug,
        greatest(c.updated_at, coalesce(
          (select max(ci.added_at) from collection_items as ci where ci.collection_id = c.id),
          c.updated_at)) as updated_at
      from follows as f
      join users as u on u.id = f.followee_id
      join collections as c on c.owner_id = u.id
      where f.follower_id = ${viewerId}::uuid
        and u.username is not null
        and c.visibility = 'public'
      union all
      select u.username, u.display_name, 'owned'::text as kind,
        null::text as title, null::text as slug, u.owned_updated_at as updated_at
      from follows as f
      join users as u on u.id = f.followee_id
      where f.follower_id = ${viewerId}::uuid
        and u.username is not null
        and u.owned_public
        and u.owned_updated_at is not null
      union all
      select u.username, u.display_name, 'wishlist'::text as kind,
        null::text as title, null::text as slug, u.wishlist_updated_at as updated_at
      from follows as f
      join users as u on u.id = f.followee_id
      where f.follower_id = ${viewerId}::uuid
        and u.username is not null
        and u.wishlist_public
        and u.wishlist_updated_at is not null
    ) as changes
    where changes.updated_at > ${since.toISOString()}::timestamptz
    order by changes.updated_at desc
    limit ${UPDATES_LIMIT}`
}

/** The 10 newest changes in the last 30 days by accounts the viewer follows. */
export async function followingUpdates(
  viewerId: string,
  now = new Date(),
): Promise<FollowUpdate[]> {
  const since = new Date(now.getTime() - UPDATES_DAYS * 24 * 60 * 60 * 1000)
  const result = await useDb().execute<UpdateRow>(updatesQuery(viewerId, since))
  return result.rows.map((row) => ({
    username: row.username,
    displayName: row.display_name,
    kind: row.kind,
    title: row.title,
    slug: row.slug,
    updatedAt: new Date(row.updated_at).toISOString(),
  }))
}

/** Who the user follows and since when, newest first, for the export. */
export async function followingForExport(
  ownerId: string,
): Promise<{ username: string; since: string }[]> {
  const rows = await useDb()
    .select({ username: users.username, since: follows.createdAt })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followeeId))
    .where(and(eq(follows.followerId, ownerId), isNotNull(users.username)))
    .orderBy(desc(follows.createdAt))
  return rows.map((row) => ({
    username: row.username!,
    since: row.since.toISOString(),
  }))
}
