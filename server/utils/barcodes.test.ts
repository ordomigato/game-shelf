import { beforeEach, describe, expect, it, vi } from 'vitest'

const askScanDex = vi.fn()
vi.mock('./scandex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scandex')>()),
  askScanDex,
}))
const ensureCatalogGames = vi.fn()
vi.mock('./catalog', () => ({ ensureCatalogGames }))
vi.mock('./collections', () => ({
  platformNames: async () => new Map<number, string>(),
}))

// Nitro auto-imports these in the server.
vi.stubGlobal(
  'createError',
  (input: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input),
)

const DAY = 24 * 60 * 60 * 1000
let failSave = false
// The ScanDex row for the code, as the table holds it.
let cached: Record<string, unknown> | undefined
// User rows the database hands back. A real database only returns the ones
// the query asks for, so a test can put rows here that it would not return:
// the code must not trust the query alone.
let userRows: Record<string, unknown>[] = []
let failPicks = false
const conditions: { sql: string; params: unknown[] }[] = []
const saved: Record<string, unknown>[] = []
const conflicts: Record<string, unknown>[] = []
vi.stubGlobal('useDb', () => ({
  select: () => ({
    from: (table: unknown) => ({
      where: async (condition: never) => {
        if (table !== barcodeLookups) return []
        const query = new PgDialect().sqlToQuery(condition)
        conditions.push(query)
        if (query.params.includes('scandex')) return cached ? [cached] : []
        if (failPicks) throw new Error('db down')
        return userRows
      },
    }),
  }),
  insert: () => ({
    values: (values: Record<string, unknown>) => ({
      onConflictDoUpdate: async (config: Record<string, unknown>) => {
        if (failSave) throw new Error('db down')
        saved.push(values)
        conflicts.push(config)
      },
    }),
  }),
}))

const { PgDialect } = await import('drizzle-orm/pg-core')
const { barcodeLookups } = await import('../db/schema')
const { lookupBarcode, findPicks, resolveBarcode } = await import('./barcodes')
const { ScanDexError } = await import('./scandex')

const match = {
  kind: 'match',
  igdbId: 26758,
  platformId: 130,
  platformName: 'Nintendo Switch',
}

beforeEach(() => {
  cached = undefined
  userRows = []
  failPicks = false
  conditions.length = 0
  saved.length = 0
  conflicts.length = 0
  askScanDex.mockReset()
  ensureCatalogGames.mockReset()
  ensureCatalogGames.mockImplementation(async (ids: number[]) =>
    ids.map((igdbId) => ({
      igdbId,
      name: `Game ${igdbId}`,
      coverId: null,
      releaseDate: null,
    })),
  )
})

describe('lookupBarcode', () => {
  it('answers from the cache, however old a match is, without asking ScanDex or counting a lookup', async () => {
    cached = {
      igdbId: 26758,
      platformId: 130,
      platformName: 'Nintendo Switch',
      fetchedAt: new Date(Date.now() - 400 * DAY),
    }
    const beforeScanDex = vi.fn()
    expect(await lookupBarcode('0045496590048', beforeScanDex)).toEqual(match)
    expect(askScanDex).not.toHaveBeenCalled()
    expect(beforeScanDex).not.toHaveBeenCalled()
  })

  it('finds a game ScanDex added since a day-old no-match, and keeps the match', async () => {
    cached = { igdbId: null, fetchedAt: new Date(Date.now() - 2 * DAY) }
    askScanDex.mockResolvedValue(match)
    const beforeScanDex = vi.fn()
    expect(await lookupBarcode('0045496590048', beforeScanDex)).toEqual(match)
    expect(beforeScanDex).toHaveBeenCalledOnce()
    expect(saved).toEqual([
      expect.objectContaining({ code: '0045496590048', igdbId: 26758 }),
    ])
  })

  it('remembers "no match" for a day, then asks again', async () => {
    cached = { igdbId: null, fetchedAt: new Date(Date.now() - 0.5 * DAY) }
    expect(await lookupBarcode('0045496590048')).toEqual({ kind: 'none' })
    expect(askScanDex).not.toHaveBeenCalled()
    cached = { igdbId: null, fetchedAt: new Date(Date.now() - 1.5 * DAY) }
    askScanDex.mockResolvedValue({ kind: 'none' })
    await lookupBarcode('0045496590048')
    expect(askScanDex).toHaveBeenCalledOnce()
    expect(saved[0]).toMatchObject({ igdbId: null, platformId: null })
  })

  it('lets a cap refuse the ScanDex call', async () => {
    const refused = Object.assign(new Error('Too many requests'), {
      statusCode: 429,
    })
    await expect(
      lookupBarcode('0045496590048', async () => {
        throw refused
      }),
    ).rejects.toBe(refused)
    expect(askScanDex).not.toHaveBeenCalled()
  })

  it('asks ScanDex with the barcode as scanned', async () => {
    askScanDex.mockResolvedValue({ kind: 'none' })
    await lookupBarcode('0036000291452', undefined, '036000291452')
    expect(askScanDex).toHaveBeenCalledWith('036000291452')
  })

  it('answers a cached barcode even when the daily cap refuses', async () => {
    cached = { igdbId: null, fetchedAt: new Date(Date.now() - 40 * DAY) }
    const answer = await lookupBarcode('0045496590048', async () => {
      throw Object.assign(new Error('Too many requests'), { statusCode: 429 })
    })
    expect(answer).toEqual({ kind: 'none' })
    expect(askScanDex).not.toHaveBeenCalled()
  })

  it('still returns ScanDex’s answer when keeping it fails', async () => {
    askScanDex.mockResolvedValue(match)
    failSave = true
    expect(await lookupBarcode('0045496590048')).toEqual(match)
    failSave = false
  })

  it('fails with a 502 when ScanDex fails and nothing is cached', async () => {
    askScanDex.mockRejectedValue(new ScanDexError('down'))
    await expect(lookupBarcode('0045496590048')).rejects.toMatchObject({
      statusCode: 502,
    })
    expect(saved).toEqual([])
  })

  it('uses an older answer when ScanDex fails', async () => {
    cached = { igdbId: null, fetchedAt: new Date(Date.now() - 40 * DAY) }
    askScanDex.mockRejectedValue(new ScanDexError('down'))
    expect(await lookupBarcode('0045496590048')).toEqual({ kind: 'none' })
  })
})

const CODE = '0045496590048'
const user = (row: Record<string, unknown>) => ({
  source: 'user',
  code: CODE,
  platformId: 130,
  submittedBy: 'user-a',
  status: 'pending',
  ...row,
})

describe('findPicks', () => {
  it('asks only for the user’s own pending picks and approved picks', async () => {
    await findPicks('user-a', CODE)
    const { sql, params } = conditions[0]!
    expect(sql).toContain('"barcode_lookups"."code" = $1')
    expect(sql).toContain('"barcode_lookups"."source" = $2')
    expect(sql).toContain('"barcode_lookups"."status" = $3')
    expect(sql).toContain('"barcode_lookups"."submitted_by" = $5')
    expect(params).toEqual([CODE, 'user', 'approved', 'pending', 'user-a'])
  })

  it('gives the user their own pending pick', async () => {
    userRows = [user({ igdbId: 7 })]
    expect((await findPicks('user-a', CODE)).own).toEqual({
      kind: 'match',
      igdbId: 7,
      platformId: 130,
      platformName: null,
    })
  })

  it('never serves a pending pick to another user', async () => {
    userRows = [user({ igdbId: 7, submittedBy: 'user-a' })]
    expect(await findPicks('user-b', CODE)).toEqual({
      own: null,
      approved: null,
    })
  })

  it('serves an approved pick to everyone, as not their own', async () => {
    userRows = [user({ igdbId: 7, status: 'approved', submittedBy: 'user-a' })]
    const other = await findPicks('user-b', CODE)
    expect(other.own).toBeNull()
    expect(other.approved).toMatchObject({ igdbId: 7 })
    const mine = await findPicks('user-a', CODE)
    expect(mine.own).toMatchObject({ igdbId: 7 })
  })

  it('serves an approved pick whose picker is gone', async () => {
    userRows = [user({ igdbId: 7, status: 'approved', submittedBy: null })]
    expect((await findPicks('user-b', CODE)).approved).toMatchObject({
      igdbId: 7,
    })
  })

  it('never serves a rejected pick, not even to its picker', async () => {
    userRows = [user({ igdbId: 7, status: 'rejected' })]
    expect(await findPicks('user-a', CODE)).toEqual({
      own: null,
      approved: null,
    })
    expect(await findPicks('user-b', CODE)).toEqual({
      own: null,
      approved: null,
    })
  })

  it('ignores ScanDex rows and other barcodes', async () => {
    userRows = [
      user({ igdbId: 7, source: 'scandex', status: null }),
      user({ igdbId: 8, code: '0045496590055', status: 'approved' }),
    ]
    expect(await findPicks('user-a', CODE)).toEqual({
      own: null,
      approved: null,
    })
  })
})

describe('resolveBarcode', () => {
  const barcode = { code: CODE, scanned: CODE }
  const cap = vi.fn(async () => {})
  beforeEach(() => cap.mockClear())

  it('prefers the user’s own pick to the approved pick, the ScanDex row and ScanDex', async () => {
    userRows = [
      user({ igdbId: 7, submittedBy: 'user-a' }),
      user({ igdbId: 8, status: 'approved', submittedBy: 'user-c' }),
    ]
    cached = { igdbId: 26758, fetchedAt: new Date() }
    const result = await resolveBarcode('user-a', barcode, cap)
    expect(result.own).toBe(true)
    expect(result.match?.igdbId).toBe(7)
    expect(askScanDex).not.toHaveBeenCalled()
    expect(cap).not.toHaveBeenCalled()
  })

  it('serves the approved pick to everyone else, over the ScanDex row, without a ScanDex call', async () => {
    userRows = [
      user({ igdbId: 7, submittedBy: 'user-a' }),
      user({ igdbId: 8, status: 'approved', submittedBy: 'user-c' }),
    ]
    cached = { igdbId: 26758, fetchedAt: new Date() }
    const other = await resolveBarcode('user-b', barcode, cap)
    expect(other.own).toBeUndefined()
    expect(other.match?.igdbId).toBe(8)
    expect(askScanDex).not.toHaveBeenCalled()
    expect(cap).not.toHaveBeenCalled()
  })

  it('does not serve a pending pick to another user: the ScanDex row answers', async () => {
    userRows = [user({ igdbId: 7, submittedBy: 'user-a' })]
    cached = { igdbId: 26758, fetchedAt: new Date() }
    const other = await resolveBarcode('user-b', barcode, cap)
    expect(other.match?.igdbId).toBe(26758)
  })

  it('does not serve a rejected pick to anyone, its picker included', async () => {
    userRows = [user({ igdbId: 7, status: 'rejected' })]
    cached = { igdbId: 26758, fetchedAt: new Date() }
    for (const id of ['user-a', 'user-b']) {
      const result = await resolveBarcode(id, barcode, cap)
      expect(result.own).toBeUndefined()
      expect(result.match?.igdbId).toBe(26758)
    }
  })

  it('uses the ScanDex row when nobody picked, even a day-old no match is not used', async () => {
    cached = { igdbId: 26758, fetchedAt: new Date() }
    const result = await resolveBarcode('user-a', barcode, cap)
    expect(result.match?.igdbId).toBe(26758)
    expect(askScanDex).not.toHaveBeenCalled()
  })

  it('asks ScanDex last, through the cap', async () => {
    askScanDex.mockResolvedValue(match)
    const result = await resolveBarcode('user-a', barcode, cap)
    expect(result.match?.igdbId).toBe(26758)
    expect(cap).toHaveBeenCalledOnce()
    expect(askScanDex).toHaveBeenCalledOnce()
  })

  it('keeps ScanDex’s answer as a ScanDex row for everyone', async () => {
    askScanDex.mockResolvedValue(match)
    await resolveBarcode('user-a', barcode, cap)
    expect(saved[0]).toMatchObject({ source: 'scandex', code: CODE })
    expect(saved[0]).not.toHaveProperty('submittedBy')
    expect(
      new PgDialect().sqlToQuery(conflicts[0]!.targetWhere as never).sql,
    ).toContain(`= 'scandex'`)
  })

  it('asks ScanDex when reading the picks fails', async () => {
    failPicks = true
    askScanDex.mockResolvedValue(match)
    const result = await resolveBarcode('user-a', barcode, cap)
    expect(result.match?.igdbId).toBe(26758)
  })

  it('falls through to the ScanDex row when reading the picked game fails', async () => {
    userRows = [user({ igdbId: 7 })]
    cached = { igdbId: 26758, fetchedAt: new Date() }
    ensureCatalogGames.mockImplementation(async (ids: number[]) => {
      if (ids.includes(7)) throw new Error('IGDB down')
      return ids.map((igdbId) => ({
        igdbId,
        name: 'G',
        coverId: null,
        releaseDate: null,
      }))
    })
    const result = await resolveBarcode('user-a', barcode, cap)
    expect(result.own).toBeUndefined()
    expect(result.match?.igdbId).toBe(26758)
  })

  it('falls back to ScanDex when IGDB no longer knows the picked game', async () => {
    userRows = [user({ igdbId: 7 })]
    ensureCatalogGames.mockImplementation(async (ids: number[]) =>
      ids
        .filter((id) => id !== 7)
        .map((igdbId) => ({
          igdbId,
          name: 'G',
          coverId: null,
          releaseDate: null,
        })),
    )
    askScanDex.mockResolvedValue(match)
    const result = await resolveBarcode('user-a', barcode, cap)
    expect(result.own).toBeUndefined()
    expect(result.match?.igdbId).toBe(26758)
  })
})
