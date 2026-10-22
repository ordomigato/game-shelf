import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const submitToScanDex = vi.fn()
vi.mock('./scandex', () => ({ submitToScanDex }))
const log = vi.fn()
vi.mock('./log', () => ({ log }))

const { PgDialect } = await import('drizzle-orm/pg-core')
const { listReviewGroups, reviewGroups, requireReviewer } =
  await import('./barcode-review')

/** The SQL text and parameters of a condition. */
const sqlOf = (condition: never) => new PgDialect().sqlToQuery(condition)

interface Call {
  kind: 'select' | 'update'
  set?: Record<string, unknown>
  where?: never
  steps: string[]
}

let calls: Call[]
/** What each `select` answers, in the order they are made. */
let selects: unknown[][]
/** Ids of the rows an approve or reject statement changes, per statement. */
let approves: { id: number }[][]
let rejects: { id: number }[][]
/** Ids a send can claim. A claim takes them, so nobody claims them twice. */
let claimable: number[]
let failRelease = false

/** A query that records what it is asked and answers when awaited. */
function query(call: Call, answer: () => unknown) {
  const q: unknown = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === 'then') {
          return (
            resolve: (value: unknown) => void,
            reject: (e: unknown) => void,
          ) => {
            try {
              resolve(answer())
            } catch (error) {
              reject(error)
            }
          }
        }
        return (...args: unknown[]) => {
          call.steps.push(prop)
          if (prop === 'set') call.set = args[0] as Record<string, unknown>
          if (prop === 'where') call.where = args[0] as never
          return q
        }
      },
    },
  )
  return q
}

vi.stubGlobal('useDb', () => ({
  select: () => {
    const call: Call = { kind: 'select', steps: [] }
    calls.push(call)
    return query(call, () => selects.shift() ?? [])
  },
  update: () => {
    const call: Call = { kind: 'update', steps: [] }
    calls.push(call)
    return query(call, () => {
      const status = call.set?.status
      if (status === 'approved') return approves.shift() ?? []
      if (status === 'rejected') return rejects.shift() ?? []
      if (call.set && 'sentAt' in call.set) {
        if (call.set.sentAt === null) {
          if (failRelease) throw new Error('db down')
          return []
        }
        const won = claimable.splice(0)
        return won.map((id) => ({ id }))
      }
      return []
    })
  },
}))

vi.stubGlobal('createError', (input: { statusCode: number }) =>
  Object.assign(new Error('x'), input),
)

const CODE = '0045496590048'
const target = (extra = {}) => ({
  code: CODE,
  igdbId: 26758,
  platformId: 130,
  ...extra,
})

beforeEach(() => {
  calls = []
  selects = []
  approves = []
  rejects = []
  claimable = []
  failRelease = false
  log.mockReset()
  submitToScanDex.mockReset()
  submitToScanDex.mockResolvedValue({ ok: true })
})

afterEach(() => vi.useRealTimers())

const updates = () => calls.filter((call) => call.kind === 'update')

describe('requireReviewer', () => {
  const requireAuth = vi.fn(async () => ({ sub: 'sub-1' }))
  let reviews = false
  const findOrCreateUser = vi.fn(async () => ({
    id: 'u1',
    reviewsBarcodes: reviews,
  }))
  vi.stubGlobal('requireAuth', requireAuth)
  vi.stubGlobal('findOrCreateUser', findOrCreateUser)

  it('is a 404 for anyone who does not review barcodes', async () => {
    reviews = false
    await expect(requireReviewer({} as never)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('gives the reviewer their user', async () => {
    reviews = true
    expect(await requireReviewer({} as never)).toMatchObject({ id: 'u1' })
  })
})

describe('listReviewGroups', () => {
  const row = (extra = {}) => ({
    code: CODE,
    igdbId: 26758,
    platformId: 130,
    sentAt: null,
    updatedAt: new Date('2026-10-02T00:00:00Z'),
    username: 'ann',
    name: 'Super Mario Odyssey',
    coverId: 'co1',
    platform: 'Nintendo Switch',
    ...extra,
  })

  it('groups picks by barcode, game and platform, and counts the people', async () => {
    selects = [
      [
        row({ username: 'cy', updatedAt: new Date('2026-10-03T00:00:00Z') }),
        row({ username: 'bob', updatedAt: new Date('2026-10-02T12:00:00Z') }),
        row({ username: 'ann' }),
        row({ igdbId: 9, name: 'Other', username: 'dee' }),
      ],
      [],
      [],
    ]
    const groups = await listReviewGroups('pending')
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      code: CODE,
      igdbId: 26758,
      name: 'Super Mario Odyssey',
      platform: 'Nintendo Switch',
      status: 'pending',
      people: 3,
      // Oldest pick first.
      users: ['ann', 'bob', 'cy'],
      pickedAt: '2026-10-03T00:00:00.000Z',
    })
    expect(groups[1]).toMatchObject({ igdbId: 9, people: 1 })
  })

  it('puts the most agreed pending groups first', async () => {
    selects = [
      [
        row({ igdbId: 1, name: 'One', username: 'a' }),
        row({ igdbId: 2, name: 'Two', username: 'a' }),
        row({ igdbId: 2, name: 'Two', username: 'b' }),
      ],
      [],
      [],
    ]
    const groups = await listReviewGroups('pending')
    expect(groups.map((g) => g.igdbId)).toEqual([2, 1])
  })

  it('only reads the status asked for, and only user picks', async () => {
    selects = [[row()], [], []]
    await listReviewGroups('rejected')
    const { sql, params } = sqlOf(calls[0]!.where!)
    expect(sql).toContain('"barcode_lookups"."source" = $1')
    expect(sql).toContain('"barcode_lookups"."status" = $2')
    expect(params).toEqual(['user', 'rejected'])
  })

  it('has nothing to say, and asks nothing more, when there are no picks', async () => {
    expect(await listReviewGroups('pending')).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('shows ScanDex’s answer and flags a different game', async () => {
    selects = [
      [row(), row({ code: '0045496590055', igdbId: 5, name: 'Five' })],
      [
        {
          code: CODE,
          igdbId: 111,
          fetchedAt: new Date(),
          name: 'Something Else',
        },
        {
          code: '0045496590055',
          igdbId: 5,
          fetchedAt: new Date(),
          name: 'Five',
        },
      ],
      [],
    ]
    const [first, second] = await listReviewGroups('pending')
    expect(first).toMatchObject({
      scandex: { igdbId: 111, name: 'Something Else' },
      disagrees: true,
    })
    expect(second).toMatchObject({ disagrees: false })
  })

  it('shows a fresh "no match" from ScanDex but not a day-old one', async () => {
    selects = [
      [row(), row({ code: '0045496590055', igdbId: 5 })],
      [
        { code: CODE, igdbId: null, fetchedAt: new Date(), name: null },
        {
          code: '0045496590055',
          igdbId: null,
          fetchedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          name: null,
        },
      ],
      [],
    ]
    const [fresh, old] = await listReviewGroups('pending')
    expect(fresh).toMatchObject({ scandex: 'none', disagrees: false })
    expect(old).toMatchObject({ scandex: null })
  })

  it('marks a pending group as conflicting with another game that is approved', async () => {
    selects = [
      [row(), row({ code: '0045496590055', igdbId: 5, name: 'Five' })],
      [],
      [
        { code: CODE, igdbId: 8, platformId: 130, name: 'Eight' },
        { code: '0045496590055', igdbId: 5, platformId: 130, name: 'Five' },
      ],
    ]
    const [conflicting, same] = await listReviewGroups('pending')
    expect(conflicting!.conflict).toEqual({ name: 'Eight' })
    expect(same!.conflict).toBeNull()
  })

  it('does not look for conflicts among approved groups', async () => {
    selects = [[row()], []]
    const [group] = await listReviewGroups('approved')
    expect(group!.conflict).toBeNull()
    expect(calls).toHaveLength(2)
  })

  it('keeps an approved pick whose picker is gone, with no name', async () => {
    selects = [[row({ username: null, sentAt: new Date() })], [], []]
    const [group] = await listReviewGroups('approved')
    expect(group).toMatchObject({ people: 1, users: [], sent: true })
  })
})

describe('approve', () => {
  it('approves all the group’s pending picks in one statement, only if no other game is approved', async () => {
    approves = [[{ id: 1 }, { id: 2 }]]
    const results = await reviewGroups('approve', [target()])
    expect(results).toEqual([{ ...target(), result: 'done' }])
    expect(updates()).toHaveLength(1)
    expect(updates()[0]!.set).toMatchObject({
      status: 'approved',
      reviewedAt: expect.any(Date),
    })
    const { sql, params } = sqlOf(updates()[0]!.where!)
    expect(sql).toContain('"barcode_lookups"."status" = $')
    expect(params).toContain('pending')
    expect(params).toContain(CODE)
    expect(sql).toContain('not exists')
    expect(sql).toContain('is distinct from')
    expect(submitToScanDex).not.toHaveBeenCalled()
  })

  it('reports a conflict when another game is approved, and approves nothing', async () => {
    approves = [[]]
    selects = [[{ id: 3 }]]
    expect(await reviewGroups('approve', [target()])).toEqual([
      { ...target(), result: 'conflict' },
    ])
  })

  it('reports a group with nothing pending as gone', async () => {
    approves = [[]]
    selects = [[]]
    expect(await reviewGroups('approve', [target()])).toEqual([
      { ...target(), result: 'gone' },
    ])
  })

  it('looks for a group without a platform by a null platform', async () => {
    approves = [[{ id: 1 }]]
    await reviewGroups('approve', [target({ platformId: null })])
    expect(sqlOf(updates()[0]!.where!).sql).toContain(
      '"barcode_lookups"."platform_id" is null',
    )
  })

  it('approves groups one after another, so two games for a barcode can’t both win', async () => {
    approves = [[{ id: 1 }], []]
    selects = [[{ id: 2 }]]
    const results = await reviewGroups('approve', [
      target(),
      target({ igdbId: 99 }),
    ])
    expect(results.map((r) => r.result)).toEqual(['done', 'conflict'])
  })

  it('treats the same group named twice as one', async () => {
    approves = [[{ id: 1 }]]
    const results = await reviewGroups('approve', [target(), target()])
    expect(results).toHaveLength(1)
    expect(updates()).toHaveLength(1)
  })

  it('looks at no more than 20 groups', async () => {
    const many = Array.from({ length: 25 }, (_, i) => target({ igdbId: i + 1 }))
    approves = many.map(() => [{ id: 1 }])
    expect(await reviewGroups('approve', many)).toHaveLength(20)
  })
})

describe('reject', () => {
  it('rejects pending picks, and approved ones that were not sent, in one statement', async () => {
    rejects = [[{ id: 1 }]]
    const results = await reviewGroups('reject', [target()])
    expect(results).toEqual([{ ...target(), result: 'done' }])
    expect(updates()[0]!.set).toMatchObject({ status: 'rejected' })
    const { sql, params } = sqlOf(updates()[0]!.where!)
    expect(sql).toContain('"barcode_lookups"."sent_at" is null')
    expect(params).toEqual(
      expect.arrayContaining(['pending', 'approved', 'user', CODE]),
    )
    expect(submitToScanDex).not.toHaveBeenCalled()
  })

  it('leaves a group that was sent, or has nothing to reject, as gone', async () => {
    rejects = [[]]
    expect(await reviewGroups('reject', [target()])).toEqual([
      { ...target(), result: 'gone' },
    ])
  })
})

describe('send', () => {
  const names = { name: 'Super Mario Odyssey', platform: 'Nintendo Switch' }

  it('sends an approved group with names from our catalog and keeps it claimed', async () => {
    selects = [[names]]
    claimable = [1, 2]
    const results = await reviewGroups('send', [target()])
    expect(results).toEqual([
      { ...target(), result: 'done', send: { result: 'sent' } },
    ])
    expect(submitToScanDex).toHaveBeenCalledOnce()
    expect(submitToScanDex.mock.calls[0]![0]).toEqual({
      igdbId: 26758,
      platformId: 130,
      platform: 'Nintendo Switch',
      name: 'Super Mario Odyssey',
      code: CODE,
    })
    // One claim, never given back.
    expect(updates().map((c) => c.set)).toEqual([{ sentAt: expect.any(Date) }])
    const { sql, params } = sqlOf(updates()[0]!.where!)
    expect(sql).toContain('"barcode_lookups"."sent_at" is null')
    expect(params).toContain('approved')
  })

  it('sends a group once when two requests ask at the same time', async () => {
    selects = [[names], [names]]
    claimable = [1]
    const [first, second] = await Promise.all([
      reviewGroups('send', [target()]),
      reviewGroups('send', [target()]),
    ])
    expect(submitToScanDex).toHaveBeenCalledOnce()
    expect([first![0]!.send!.result, second![0]!.send!.result].sort()).toEqual([
      'failed',
      'sent',
    ])
  })

  it('gives the claim back when ScanDex refuses, and returns its status and message', async () => {
    selects = [[names]]
    claimable = [1, 2]
    submitToScanDex.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'value must be a string',
    })
    const results = await reviewGroups('send', [target()])
    expect(results[0]!.send).toEqual({
      result: 'failed',
      status: 400,
      message: 'value must be a string',
    })
    expect(updates().map((c) => c.set)).toEqual([
      { sentAt: expect.any(Date) },
      { sentAt: null },
    ])
    // Given back by id, only the rows that were claimed.
    expect(sqlOf(updates()[1]!.where!).params).toEqual([1, 2])
  })

  it('gives the claim back when ScanDex times out', async () => {
    selects = [[names]]
    claimable = [1]
    submitToScanDex.mockResolvedValue({ ok: false, status: 0, message: null })
    const results = await reviewGroups('send', [target()])
    expect(results[0]!.send).toEqual({
      result: 'failed',
      status: 0,
      message: null,
    })
    expect(updates().at(-1)!.set).toEqual({ sentAt: null })
  })

  it('keeps the groups that were sent and gives back only the failures', async () => {
    selects = [[names], [names]]
    claimable = [1]
    submitToScanDex
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 500, message: null })
    const results = await reviewGroups('send', [
      target(),
      target({ code: '0045496590055' }),
    ])
    expect(results.map((r) => r.send!.result).sort()).toEqual([
      'failed',
      'sent',
    ])
  })

  it('does not send a group that is not approved and unsent', async () => {
    selects = [[names]]
    claimable = []
    const results = await reviewGroups('send', [target()])
    expect(submitToScanDex).not.toHaveBeenCalled()
    expect(results[0]!.send).toEqual({
      result: 'failed',
      status: 0,
      message: null,
    })
  })

  it('does not send a group with no platform, or a game our catalog lacks', async () => {
    selects = [[]]
    const results = await reviewGroups('send', [
      target({ platformId: null }),
      target({ igdbId: 5 }),
    ])
    expect(submitToScanDex).not.toHaveBeenCalled()
    expect(updates()).toEqual([])
    expect(results.map((r) => r.send!.result)).toEqual(['failed', 'failed'])
  })

  it('never throws and never logs the database’s error or the barcode', async () => {
    selects = [[names]]
    claimable = [1]
    submitToScanDex.mockResolvedValue({ ok: false, status: 0, message: null })
    failRelease = true
    const results = await reviewGroups('send', [target()])
    expect(results[0]!.send!.result).toBe('failed')
    expect(log).toHaveBeenCalledWith('warn', 'barcode.review_failed', {
      status: -1,
      error: 'Error',
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain(CODE)
  })
})

describe('approve and send', () => {
  const names = { name: 'Super Mario Odyssey', platform: 'Nintendo Switch' }

  it('approves, then sends what was approved', async () => {
    approves = [[{ id: 1 }]]
    selects = [[names]]
    claimable = [1]
    const results = await reviewGroups('approveAndSend', [target()])
    expect(results).toEqual([
      { ...target(), result: 'done', send: { result: 'sent' } },
    ])
    expect(updates().map((c) => c.set?.status ?? 'claim')).toEqual([
      'approved',
      'claim',
    ])
  })

  it('stays approved when the send fails, ready to send again', async () => {
    approves = [[{ id: 1 }]]
    selects = [[names]]
    claimable = [1]
    submitToScanDex.mockResolvedValue({
      ok: false,
      status: 502,
      message: 'down',
    })
    const [result] = await reviewGroups('approveAndSend', [target()])
    expect(result).toMatchObject({
      result: 'done',
      send: { result: 'failed', status: 502, message: 'down' },
    })
    // Only the claim was given back, never the approval.
    expect(updates().map((c) => c.set?.status)).toEqual([
      'approved',
      undefined,
      undefined,
    ])
    expect(updates().at(-1)!.set).toEqual({ sentAt: null })
  })

  it('sends nothing for a group that conflicts', async () => {
    approves = [[]]
    selects = [[{ id: 3 }]]
    const [result] = await reviewGroups('approveAndSend', [target()])
    expect(result).toEqual({ ...target(), result: 'conflict' })
    expect(submitToScanDex).not.toHaveBeenCalled()
  })
})
