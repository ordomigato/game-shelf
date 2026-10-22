import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const submitToScanDex = vi.fn()
vi.mock('./scandex', () => ({ submitToScanDex }))
const log = vi.fn()
vi.mock('./log', () => ({ log }))

const { PgDialect } = await import('drizzle-orm/pg-core')
const { listReviewGroups, reviewGroups, MAX_REVIEW_GROUPS } =
  await import('./barcode-review')

/** The SQL text and parameters of a condition. */
const sqlOf = (condition: never) => new PgDialect().sqlToQuery(condition)

interface Call {
  kind: 'select' | 'update'
  set?: Record<string, unknown>
  where?: never
  steps: string[]
  args: Record<string, unknown[]>
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
          call.args[prop] = args
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
    const call: Call = { kind: 'select', steps: [], args: {} }
    calls.push(call)
    return query(call, () => selects.shift() ?? [])
  },
  update: () => {
    const call: Call = { kind: 'update', steps: [], args: {} }
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

describe('listReviewGroups', () => {
  /** A group as the grouping statement returns it. */
  const row = (extra = {}) => ({
    code: CODE,
    igdbId: 26758,
    platformId: 130,
    name: 'Super Mario Odyssey',
    coverId: 'co1',
    platform: 'Nintendo Switch',
    people: 1,
    users: ['ann'],
    pickedAt: new Date('2026-10-02T00:00:00Z'),
    unsent: 1,
    ...extra,
  })
  const list = async (status: Parameters<typeof listReviewGroups>[0]) =>
    (await listReviewGroups(status)).groups

  it('turns each grouped row into a group, with the people and who', async () => {
    selects = [
      [
        row({
          people: 3,
          users: ['ann', 'bob', 'cy'],
          pickedAt: new Date('2026-10-03T00:00:00Z'),
        }),
        row({ igdbId: 9, name: 'Other', users: ['dee'] }),
      ],
      [],
      [],
    ]
    const groups = await list('pending')
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      code: CODE,
      igdbId: 26758,
      name: 'Super Mario Odyssey',
      platform: 'Nintendo Switch',
      status: 'pending',
      people: 3,
      users: ['ann', 'bob', 'cy'],
      pickedAt: '2026-10-03T00:00:00.000Z',
    })
    expect(groups[1]).toMatchObject({ igdbId: 9, people: 1 })
  })

  it('groups in one statement, most agreed first for pending, newest first otherwise', async () => {
    selects = [[row()], [], []]
    await list('pending')
    selects = [[row()], []]
    await list('approved')
    const [pending, approved] = calls.filter((call) =>
      call.steps.includes('groupBy'),
    )
    expect(pending!.steps).toEqual(
      expect.arrayContaining(['groupBy', 'orderBy', 'limit']),
    )
    expect(pending!.args.orderBy).toHaveLength(3)
    expect(approved!.args.orderBy).toHaveLength(2)
    expect(calls.filter((c) => c.steps.includes('groupBy'))).toHaveLength(2)
  })

  it('reads one group more than it shows, to know if more exist', async () => {
    selects = [[row()], [], []]
    await list('pending')
    expect(calls[0]!.args.limit).toEqual([MAX_REVIEW_GROUPS + 1])
    expect(MAX_REVIEW_GROUPS).toBe(500)
  })

  it('says when more groups exist than are shown, and shows only the cap', async () => {
    selects = [
      Array.from({ length: MAX_REVIEW_GROUPS + 1 }, (_, i) =>
        row({ igdbId: i + 1, code: String(4549659000000 + i) }),
      ),
      [],
      [],
    ]
    const result = await listReviewGroups('pending')
    expect(result.groups).toHaveLength(MAX_REVIEW_GROUPS)
    expect(result.truncated).toBe(true)
  })

  it('does not say so when everything fits', async () => {
    selects = [
      Array.from({ length: MAX_REVIEW_GROUPS }, (_, i) =>
        row({ igdbId: i + 1 }),
      ),
      [],
      [],
    ]
    const result = await listReviewGroups('pending')
    expect(result.groups).toHaveLength(MAX_REVIEW_GROUPS)
    expect(result.truncated).toBe(false)
  })

  it('only reads the status asked for, and only user picks', async () => {
    selects = [[row()], [], []]
    await list('rejected')
    const { sql, params } = sqlOf(calls[0]!.where!)
    expect(sql).toContain('"barcode_lookups"."source" = $1')
    expect(sql).toContain('"barcode_lookups"."status" = $2')
    expect(params).toEqual(['user', 'rejected'])
  })

  it('has nothing to say, and asks nothing more, when there are no picks', async () => {
    expect(await listReviewGroups('pending')).toEqual({
      groups: [],
      truncated: false,
    })
    expect(calls).toHaveLength(1)
  })

  it('counts a group as sent only when every row of it was', async () => {
    selects = [
      [row({ unsent: 0, people: 2 }), row({ igdbId: 9, unsent: 1, people: 2 })],
      [],
    ]
    const [sent, mixed] = await list('approved')
    expect(sent!.sent).toBe(true)
    expect(mixed!.sent).toBe(false)
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
    const [first, second] = await list('pending')
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
    const [fresh, old] = await list('pending')
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
    const [conflicting, same] = await list('pending')
    expect(conflicting!.conflict).toEqual({ name: 'Eight' })
    expect(same!.conflict).toBeNull()
  })

  it('does not look for conflicts among approved groups', async () => {
    selects = [[row()], []]
    const [group] = await list('approved')
    expect(group!.conflict).toBeNull()
    expect(calls).toHaveLength(2)
  })

  it('keeps an approved pick whose picker is gone, with no name', async () => {
    selects = [[row({ users: [], unsent: 0 })], [], []]
    const [group] = await list('approved')
    expect(group).toMatchObject({ people: 1, users: [], sent: true })
  })
})

describe('approve', () => {
  it('approves all the group’s pending or rejected picks in one statement, only if no other game is approved', async () => {
    approves = [[{ id: 1 }, { id: 2 }]]
    const results = await reviewGroups('approve', [target()])
    expect(results).toEqual([{ ...target(), result: 'done' }])
    expect(updates()).toHaveLength(1)
    expect(updates()[0]!.set).toMatchObject({
      status: 'approved',
      reviewedAt: expect.any(Date),
    })
    const { sql, params } = sqlOf(updates()[0]!.where!)
    expect(sql).toContain('"barcode_lookups"."status" in ($')
    expect(params).toEqual(expect.arrayContaining(['pending', 'rejected']))
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

  it('reports a group with nothing left to approve as gone', async () => {
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
    // One claim, then every approved row of the group marked as sent. Nothing
    // is given back.
    expect(updates().map((c) => c.set)).toEqual([
      { sentAt: expect.any(Date) },
      { sentAt: expect.any(Date) },
    ])
    const { sql, params } = sqlOf(updates()[0]!.where!)
    expect(sql).toContain('"barcode_lookups"."sent_at" is null')
    expect(params).toContain('approved')
  })

  it('sends a group once when two requests ask at the same time', async () => {
    selects = [[names], [names], [{ id: 1 }]]
    claimable = [1]
    const [first, second] = await Promise.all([
      reviewGroups('send', [target()]),
      reviewGroups('send', [target()]),
    ])
    expect(submitToScanDex).toHaveBeenCalledOnce()
    expect([first![0]!.send!.result, second![0]!.send!.result].sort()).toEqual([
      'already',
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

  it('says already when every row of the group was sent before, and sends nothing', async () => {
    selects = [[names], [{ id: 4 }]]
    claimable = []
    const results = await reviewGroups('send', [target()])
    expect(submitToScanDex).not.toHaveBeenCalled()
    expect(results).toEqual([
      { ...target(), result: 'done', send: { result: 'already' } },
    ])
    expect(updates()).toHaveLength(1)
  })

  it('claims only the unsent rows of a mixed group, and marks them all sent afterwards', async () => {
    selects = [[names]]
    claimable = [8, 9]
    await reviewGroups('send', [target()])
    expect(submitToScanDex).toHaveBeenCalledOnce()
    const claim = sqlOf(updates()[0]!.where!)
    expect(claim.sql).toContain('"barcode_lookups"."sent_at" is null')
    expect(claim.params).toContain('approved')
    const mark = sqlOf(updates()[1]!.where!)
    expect(mark.sql).toContain('"barcode_lookups"."sent_at" is null')
    expect(mark.params).toContain('approved')
    expect(updates()[1]!.set).toEqual({ sentAt: expect.any(Date) })
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
