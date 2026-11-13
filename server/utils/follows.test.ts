import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/neon-http'
import { blocks, follows } from '../db/schema'

const ME = '00000000-0000-4000-8000-000000000001'
const THEM = '00000000-0000-4000-8000-000000000002'

const dialect = new PgDialect()

/** A real query builder, which never runs a query: for reading the SQL it makes. */
const builder = drizzle.mock()

/** What the fake database answers, and what was written to it. */
let relation: Record<string, unknown>
let selectRows: unknown[]
let counted: number
const writes: { table: unknown; values?: unknown; where?: unknown }[] = []
const batches: unknown[][] = []
let useBuilder = false
const executed: Parameters<PgDialect['sqlToQuery']>[0][] = []
let insertedRows: unknown[] = [{ follower_id: 'x' }]

function chain(rows: () => unknown) {
  const self: Record<string, unknown> = {}
  for (const name of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) {
    self[name] = () => self
  }
  self.then = (resolve: (value: unknown) => unknown) => resolve(rows())
  return self
}

const fake = {
  execute: async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
    const { sql } = dialect.sqlToQuery(query)
    if (sql.includes('insert into follows')) {
      executed.push(query)
      return { rows: insertedRows }
    }
    return { rows: [relation] }
  },
  select: (fields: Record<string, unknown>) =>
    chain(() => ('n' in fields ? [{ n: counted }] : selectRows)),
  insert: (table: unknown) => ({
    values: (values: unknown) => {
      writes.push({ table, values })
      return { onConflictDoNothing: () => ({ table, values, kind: 'insert' }) }
    },
  }),
  delete: (table: unknown) => ({
    where: (where: unknown) => {
      writes.push({ table, where })
      return { table, where, kind: 'delete' }
    },
  }),
  batch: async (statements: unknown[]) => {
    batches.push(statements)
    return []
  },
}

vi.stubGlobal('useDb', () => (useBuilder ? builder : fake))

const {
  MAX_FOLLOWING,
  blockUser,
  decodeCursor,
  encodeCursor,
  followCounts,
  followInsert,
  followPage,
  followRowsQuery,
  followState,
  followUser,
  removeFollower,
  unfollowUser,
  updatesQuery,
} = await import('./follows')

beforeEach(() => {
  useBuilder = false
  relation = {
    following: false,
    followed_by: false,
    blocking: false,
    blocked_by: false,
    total: 0,
  }
  selectRows = []
  counted = 0
  writes.length = 0
  batches.length = 0
  executed.length = 0
  insertedRows = [{ follower_id: 'x' }]
})

describe('followUser', () => {
  it('stores a follow', async () => {
    expect(await followUser(ME, THEM)).toBe('followed')
    expect(executed).toHaveLength(1)
    expect(dialect.sqlToQuery(executed[0]!).params).toEqual([
      ME,
      THEM,
      THEM,
      ME,
      ME,
      THEM,
    ])
  })

  it('stores the follow only if neither has blocked the other, in the same statement', () => {
    const { sql } = dialect.sqlToQuery(followInsert(ME, THEM))
    expect(sql).toContain('insert into follows')
    expect(sql).toContain('where not exists')
    expect(sql).toContain('from blocks as b')
    expect(sql).toContain(' or ')
    expect(sql).toContain('on conflict do nothing')
  })

  it('looks the same but is ignored when a block landed after the read', async () => {
    insertedRows = []
    expect(await followUser(ME, THEM)).toBe('ignored')
  })

  it('refuses yourself with a 400, before touching the database', async () => {
    await expect(followUser(ME, ME)).rejects.toMatchObject({ statusCode: 400 })
    expect(writes).toHaveLength(0)
  })

  it('answers the same but stores nothing when they blocked you', async () => {
    relation.blocked_by = true
    expect(await followUser(ME, THEM)).toBe('ignored')
    expect(writes).toHaveLength(0)
  })

  it('refuses to follow someone you blocked, with a 409', async () => {
    relation.blocking = true
    await expect(followUser(ME, THEM)).rejects.toMatchObject({
      statusCode: 409,
    })
    expect(writes).toHaveLength(0)
  })

  it('is idempotent, even at the limit', async () => {
    relation.following = true
    relation.total = MAX_FOLLOWING
    expect(await followUser(ME, THEM)).toBe('already')
    expect(writes).toHaveLength(0)
  })

  it('stops at 2,000 followed accounts', async () => {
    relation.total = MAX_FOLLOWING
    await expect(followUser(ME, THEM)).rejects.toMatchObject({
      statusCode: 403,
      data: { key: 'follows.limitReached', params: { limit: 2000 } },
    })
    expect(writes).toHaveLength(0)
  })
})

describe('unfollowing and removing a follower', () => {
  it('unfollow deletes only the viewer’s own follow', async () => {
    await unfollowUser(ME, THEM)
    const { sql, params } = dialect.sqlToQuery(writes[0]!.where as never)
    expect(sql).toContain('"follows"."follower_id" = $1')
    expect(sql).toContain('"follows"."followee_id" = $2')
    expect(params).toEqual([ME, THEM])
  })

  it('removing a follower deletes the follow of them, aimed at the owner', async () => {
    await removeFollower(ME, THEM)
    const { sql, params } = dialect.sqlToQuery(writes[0]!.where as never)
    expect(sql).toContain('"follows"."followee_id" = $1')
    expect(sql).toContain('"follows"."follower_id" = $2')
    expect(params).toEqual([ME, THEM])
  })
})

describe('blockUser', () => {
  it('stores the block and ends the follows both ways in one batch', async () => {
    await blockUser(ME, THEM)
    expect(batches).toHaveLength(1)
    const [insert, remove] = batches[0] as { table: unknown; where?: never }[]
    expect(insert!.table).toBe(blocks)
    expect(remove!.table).toBe(follows)
    const { sql, params } = dialect.sqlToQuery(remove!.where!)
    expect(sql).toContain(' or ')
    expect(params).toEqual([ME, THEM, THEM, ME])
  })

  it('refuses blocking yourself', async () => {
    await expect(blockUser(ME, ME)).rejects.toMatchObject({ statusCode: 400 })
    expect(batches).toHaveLength(0)
  })

  it('stops at the block limit', async () => {
    counted = 500
    await expect(blockUser(ME, THEM)).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(batches).toHaveLength(0)
  })
})

describe('follow lists', () => {
  const input = {
    kind: 'followers' as const,
    ownerId: THEM,
    viewerId: ME,
    cursor: null,
  }

  it('leave out accounts that hid their lists, for everyone but the owner', () => {
    useBuilder = true
    const others = followRowsQuery({ ...input, showHidden: false }).toSQL()
    expect(others.sql).toContain('"users"."follows_public" = $')
    expect(others.params).toContain(true)
    const owner = followRowsQuery({ ...input, showHidden: true }).toSQL()
    expect(owner.sql).not.toContain('follows_public')
  })

  it('read only the owner’s side of the follows and skip accounts with no username', () => {
    useBuilder = true
    const { sql, params } = followRowsQuery({
      ...input,
      showHidden: false,
    }).toSQL()
    expect(sql).toContain('"follows"."followee_id" = $')
    expect(sql).toContain('"users"."username" is not null')
    expect(params).toContain(THEM)
    const following = followRowsQuery({
      ...input,
      kind: 'following',
      showHidden: false,
    }).toSQL()
    expect(following.sql).toContain('"follows"."follower_id" = $')
  })

  it('page after a cursor, newest first, one past the page size', () => {
    useBuilder = true
    const { sql, params } = followRowsQuery({
      ...input,
      showHidden: false,
      cursor: { since: '2026-11-01 10:00:00.123456+00', rowId: THEM },
    }).toSQL()
    expect(sql).toContain('(follows.created_at, users.id) < (')
    expect(sql).toContain(
      'order by "follows"."created_at" desc, "users"."id" desc',
    )
    expect(params).toContain('2026-11-01 10:00:00.123456+00')
    expect(params).toContain(THEM)
    expect(params).toContain(51)
  })

  it('hands out an opaque cursor that reads back to the same pair', () => {
    const cursor = { since: '2026-11-01 10:00:00.123456+00', rowId: THEM }
    const encoded = encodeCursor(cursor)
    expect(encoded).not.toContain(THEM)
    expect(encoded).toMatch(/^[\w-]+$/)
    expect(decodeCursor(encoded)).toEqual(cursor)
  })

  it('refuses a cursor that is not one of ours with a 400', () => {
    const bad = [
      'nonsense',
      '',
      Buffer.from('2026-11-01 10:00:00+00').toString('base64url'),
      Buffer.from(`not a time|${THEM}`).toString('base64url'),
      Buffer.from('2026-11-01 10:00:00+00|nope').toString('base64url'),
      Buffer.from(`2026-11-01 10:00:00+00|${THEM}|x`).toString('base64url'),
    ]
    for (const value of bad) {
      expect(() => decodeCursor(value)).toThrow(
        expect.objectContaining({ statusCode: 400 }),
      )
    }
  })

  it('shows the owner every row and others only the rows the query let through', async () => {
    selectRows = [
      {
        username: 'sam',
        displayName: null,
        since: '2026-11-01 10:00:00+00',
        viewerFollows: true,
        followsViewer: true,
        isYou: false,
      },
      {
        username: 'alex',
        displayName: 'Alex',
        since: '2026-10-01 10:00:00+00',
        viewerFollows: true,
        followsViewer: false,
        isYou: false,
      },
    ]
    const page = await followPage({
      kind: 'followers',
      owner: { id: THEM },
      viewerId: ME,
      cursor: null,
    })
    expect(page.items.map((row) => [row.username, row.mutual])).toEqual([
      ['sam', true],
      ['alex', false],
    ])
    expect(page.next).toBeNull()
  })

  it('gives a next cursor only when there is a row past the page', async () => {
    selectRows = Array.from({ length: 51 }, (_, index) => ({
      username: `user_${index}`,
      displayName: null,
      since: `2026-11-01 10:00:${String(59 - (index % 60)).padStart(2, '0')}+00`,
      rowId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      viewerFollows: false,
      followsViewer: false,
      isYou: false,
    }))
    const page = await followPage({
      kind: 'following',
      owner: { id: THEM },
      viewerId: null,
      cursor: null,
    })
    expect(page.items).toHaveLength(50)
    expect(decodeCursor(page.next!)).toEqual({
      since: (selectRows[49] as { since: string }).since,
      rowId: (selectRows[49] as { rowId: string }).rowId,
    })
  })
})

describe('followCounts', () => {
  it('counts the rows the lists would show', async () => {
    counted = 3
    expect(await followCounts({ id: THEM }, ME)).toEqual({
      following: 3,
      followers: 3,
    })
  })
})

describe('followState', () => {
  const viewer = { id: ME, roles: ['user' as const] }
  const owner = (followsPublic: boolean) => ({ id: THEM, followsPublic })

  it('shows the counts and the relationship to a signed-in viewer', async () => {
    counted = 3
    relation = { ...relation, following: true, blocking: true }
    expect(await followState(owner(true), viewer)).toEqual({
      counts: { following: 3, followers: 3 },
      relationship: { following: true, followedBy: false, blocking: true },
    })
  })

  it('hides the counts from everyone but the owner when the lists are private', async () => {
    counted = 3
    expect((await followState(owner(false), viewer)).counts).toBeNull()
    expect((await followState(owner(false), null)).counts).toBeNull()
    const self = { id: THEM, roles: ['user' as const] }
    expect((await followState(owner(false), self)).counts).toEqual({
      following: 3,
      followers: 3,
    })
  })

  it('has no relationship for a visitor or on the viewer’s own account', async () => {
    counted = 1
    expect(await followState(owner(true), null)).toEqual({
      counts: { following: 1, followers: 1 },
      relationship: null,
    })
    const self = { id: THEM, roles: ['user' as const] }
    expect((await followState(owner(true), self)).relationship).toBeNull()
  })
})

describe('the home section query', () => {
  const sql = () => dialect.sqlToQuery(updatesQuery(ME, new Date('2026-11-12')))

  it('reads only public collections and only public Owned and Wishlist', () => {
    const { sql: text } = sql()
    expect(text).toContain("c.visibility = 'public'")
    expect(text).toContain('u.owned_public')
    expect(text).toContain('u.wishlist_public')
    expect(text).not.toContain('private')
  })

  it('starts from the viewer’s own follows, in every part', () => {
    const { sql: text, params } = sql()
    expect(text.match(/f\.follower_id = \$\d::uuid/g)).toHaveLength(3)
    expect(params.filter((param) => param === ME)).toHaveLength(3)
  })

  it('keeps the newest ten since the cutoff', () => {
    const { sql: text, params } = sql()
    expect(text).toContain('order by changes.updated_at desc')
    expect(params).toContain('2026-11-12T00:00:00.000Z')
    expect(params).toContain(10)
  })
})
