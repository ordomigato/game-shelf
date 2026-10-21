import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const submitToScanDex = vi.fn()
vi.mock('./scandex', () => ({ submitToScanDex }))
const log = vi.fn()
vi.mock('./log', () => ({ log }))

interface Row {
  code: string
  igdbId: number
  name: string
  coverId: string | null
  platformId: number
  platform: string
}

/** What the eligibility query finds, as the database would answer it. */
let eligible: Row[]
/** Codes nobody has claimed yet. */
let unclaimed: string[]
let updates: Record<string, unknown>[]
let failClaim = false
let joined: unknown[]
let conditions: unknown[]

const { PgDialect } = await import('drizzle-orm/pg-core')
const { barcodeLookups, games, platforms } = await import('../db/schema')

/** The SQL text and parameters of a condition. */
const sqlOf = (condition: never) => new PgDialect().sqlToQuery(condition)

vi.stubGlobal('useDb', () => ({
  select: () => {
    let rows: Row[] = []
    const query = {
      from: () => query,
      innerJoin: (table: unknown) => {
        joined.push(table)
        return query
      },
      where: (condition: never) => {
        conditions.push(condition)
        const { params } = sqlOf(condition)
        // Like `inArray` on the codes, when the query has one.
        const asked = eligible.filter((row) => params.includes(row.code))
        const narrowed = params.some((p) =>
          eligible.some((row) => row.code === p),
        )
        rows = narrowed ? asked : eligible
        return query
      },
      orderBy: () => query,
      limit: () => query,
      then: (resolve: (rows: Row[]) => void) => resolve(rows),
    }
    return query
  },
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: (condition: never) => {
        updates.push(values)
        const done = Promise.resolve()
        return Object.assign(done, {
          // Claims only the codes asked for that nobody has claimed.
          returning: async () => {
            if (failClaim) throw new Error('db down')
            const { params } = sqlOf(condition)
            const claimed = unclaimed.filter((code) => params.includes(code))
            unclaimed = unclaimed.filter((code) => !claimed.includes(code))
            return claimed.map((code) => ({ code }))
          },
        })
      },
    }),
  }),
}))

const { listSuggestions, sendSuggestions } =
  await import('./barcode-contribute')

const CODE = '0045496590048'
const row = (code = CODE): Row => ({
  code,
  igdbId: 26758,
  name: 'Super Mario Odyssey',
  coverId: 'co1abc',
  platformId: 130,
  platform: 'Nintendo Switch',
})

beforeEach(() => {
  eligible = [row()]
  unclaimed = [CODE]
  updates = []
  joined = []
  conditions = []
  failClaim = false
  log.mockReset()
  submitToScanDex.mockReset()
  submitToScanDex.mockResolvedValue({ ok: true })
})

afterEach(() => vi.useRealTimers())

describe('listSuggestions', () => {
  it('lists the code, game, cover and platform from our catalog, and nothing else', async () => {
    expect(await listSuggestions('u1')).toEqual([
      {
        code: CODE,
        igdbId: 26758,
        name: 'Super Mario Odyssey',
        coverId: 'co1abc',
        platform: 'Nintendo Switch',
      },
    ])
  })

  it('only looks at unsent picks of this user for a box ScanDex had no game for', async () => {
    await listSuggestions('u1')
    const { sql, params } = sqlOf(conditions[0] as never)
    expect(sql).toContain('"user_barcodes"."owner_id" = $')
    expect(params).toContain('u1')
    expect(sql).toContain('"user_barcodes"."submitted_at" is null')
    expect(sql).toContain('"barcode_lookups"."igdb_id" is null')
  })

  it('joins the platform and the game, so a pick with no platform is never listed', async () => {
    await listSuggestions('u1')
    expect(joined).toContain(platforms)
    expect(joined).toContain(games)
    // A Change on a ScanDex match has a lookup row with a game, which the
    // condition above rejects.
    expect(joined).toContain(barcodeLookups)
  })
})

describe('sendSuggestions', () => {
  it('sends an eligible pick with names from our catalog and keeps it claimed', async () => {
    const results = await sendSuggestions('u1', [CODE])
    expect(results).toEqual([{ code: CODE, result: 'sent' }])
    expect(submitToScanDex).toHaveBeenCalledOnce()
    expect(submitToScanDex.mock.calls[0]![0]).toEqual({
      igdbId: 26758,
      platformId: 130,
      platform: 'Nintendo Switch',
      name: 'Super Mario Odyssey',
      code: CODE,
    })
    expect(updates).toEqual([{ submittedAt: expect.any(Date) }])
  })

  it('checks eligibility itself: a code the server does not find eligible is never sent', async () => {
    eligible = []
    const results = await sendSuggestions('u1', [CODE])
    expect(submitToScanDex).not.toHaveBeenCalled()
    expect(updates).toEqual([])
    expect(results).toEqual([
      { code: CODE, result: 'failed', status: 0, message: null },
    ])
    const { sql } = sqlOf(conditions[0] as never)
    expect(sql).toContain('"barcode_lookups"."igdb_id" is null')
    expect(sql).toContain('"user_barcodes"."submitted_at" is null')
  })

  it('never sends a code that is already claimed, so two requests send it once', async () => {
    const [first, second] = await Promise.all([
      sendSuggestions('u1', [CODE]),
      sendSuggestions('u1', [CODE]),
    ])
    expect(submitToScanDex).toHaveBeenCalledOnce()
    expect([first![0]!.result, second![0]!.result].sort()).toEqual([
      'failed',
      'sent',
    ])
  })

  it('gives the code back when ScanDex refuses, and returns its status and message', async () => {
    submitToScanDex.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'value must be a string',
    })
    const results = await sendSuggestions('u1', [CODE])
    expect(results).toEqual([
      {
        code: CODE,
        result: 'failed',
        status: 400,
        message: 'value must be a string',
      },
    ])
    expect(updates).toEqual([
      { submittedAt: expect.any(Date) },
      { submittedAt: null },
    ])
  })

  it('keeps the ones that were sent and gives back only the failures', async () => {
    const other = '0045496590055'
    eligible = [row(), row(other)]
    unclaimed = [CODE, other]
    submitToScanDex
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 500, message: null })
    const results = await sendSuggestions('u1', [CODE, other])
    expect(results.map((r) => r.result).sort()).toEqual(['failed', 'sent'])
    expect(updates).toEqual([
      { submittedAt: expect.any(Date) },
      { submittedAt: null },
    ])
  })

  it('sends at most 20 in one request', async () => {
    const codes = Array.from({ length: 25 }, (_, i) =>
      String(4549659000000 + i),
    )
    eligible = codes.map((code) => row(code))
    unclaimed = [...codes]
    const results = await sendSuggestions('u1', codes)
    expect(submitToScanDex).toHaveBeenCalledTimes(20)
    expect(results).toHaveLength(20)
  })

  it('gives up after 3 seconds in total, gives the claim back and says it failed', async () => {
    vi.useFakeTimers()
    submitToScanDex.mockReturnValue(new Promise(() => {}))
    const done = sendSuggestions('u1', [CODE])
    await vi.advanceTimersByTimeAsync(3000)
    expect(await done).toEqual([
      { code: CODE, result: 'failed', status: 0, message: null },
    ])
    expect(updates.at(-1)).toEqual({ submittedAt: null })
  })

  it('never throws and never logs the database’s error or the barcode', async () => {
    failClaim = true
    const results = await sendSuggestions('u1', [CODE])
    expect(results).toEqual([
      { code: CODE, result: 'failed', status: 0, message: null },
    ])
    expect(log).toHaveBeenCalledWith('warn', 'barcode.suggest_failed', {
      status: -1,
      error: 'Error',
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain(CODE)
  })
})
