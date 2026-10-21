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
let cached: Record<string, unknown> | undefined
// Rows of user_barcodes, as the table holds them.
let ownRows: Record<string, unknown>[] = []
const ownConditions: unknown[] = []
const saved: Record<string, unknown>[] = []
vi.stubGlobal('useDb', () => ({
  select: () => ({
    from: (table: unknown) => ({
      where: async (condition: unknown) => {
        if (table === userBarcodes) {
          ownConditions.push(condition)
          return ownRows.filter((row) => matches(condition, row))
        }
        if (table === barcodeLookups) return cached ? [cached] : []
        return []
      },
    }),
  }),
  insert: () => ({
    values: (values: Record<string, unknown>) => ({
      onConflictDoUpdate: async () => {
        if (failSave) throw new Error('db down')
        saved.push(values)
      },
    }),
  }),
}))

// Reads the owner and code a `findOwnPick` query was scoped to.
function matches(condition: unknown, row: Record<string, unknown>): boolean {
  const values: unknown[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const chunk = node as { queryChunks?: unknown[]; value?: unknown }
    if (chunk.queryChunks) chunk.queryChunks.forEach(walk)
    else if (
      'encoder' in chunk &&
      'value' in chunk &&
      typeof chunk.value === 'string'
    )
      values.push(chunk.value)
  }
  walk(condition)
  return values.includes(row.ownerId) && values.includes(row.code)
}

const { PgDialect } = await import('drizzle-orm/pg-core')
const { userBarcodes, barcodeLookups } = await import('../db/schema')
const { lookupBarcode, findOwnPick, resolveBarcode } =
  await import('./barcodes')
const { ScanDexError } = await import('./scandex')

const match = {
  kind: 'match',
  igdbId: 26758,
  platformId: 130,
  platformName: 'Nintendo Switch',
}

beforeEach(() => {
  cached = undefined
  ownRows = []
  ownConditions.length = 0
  saved.length = 0
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

describe('findOwnPick', () => {
  const pick = {
    ownerId: 'user-a',
    code: '0045496590048',
    igdbId: 7,
    platformId: 130,
  }

  it('gives the user their own pick, without asking ScanDex', async () => {
    ownRows = [pick]
    expect(await findOwnPick('user-a', '0045496590048')).toEqual({
      kind: 'match',
      igdbId: 7,
      platformId: 130,
      platformName: null,
    })
    expect(askScanDex).not.toHaveBeenCalled()
  })

  it('filters on the owner and the barcode in the query itself', async () => {
    await findOwnPick('user-a', '0045496590048')
    const { sql, params } = new PgDialect().sqlToQuery(
      ownConditions[0] as never,
    )
    expect(sql).toContain('"user_barcodes"."owner_id" = $1')
    expect(sql).toContain('"user_barcodes"."code" = $2')
    expect(params).toEqual(['user-a', '0045496590048'])
  })

  it('keeps two users’ picks for one barcode apart', async () => {
    ownRows = [
      { ownerId: 'user-a', code: '0045496590048', igdbId: 7 },
      { ownerId: 'user-b', code: '0045496590048', igdbId: 9 },
    ]
    expect(await findOwnPick('user-a', '0045496590048')).toMatchObject({
      igdbId: 7,
    })
    expect(await findOwnPick('user-b', '0045496590048')).toMatchObject({
      igdbId: 9,
    })
  })

  it('never gives one user another user’s pick', async () => {
    ownRows = [pick]
    expect(await findOwnPick('user-b', '0045496590048')).toBeNull()
  })

  it('has nothing for a barcode the user never matched', async () => {
    ownRows = [pick]
    expect(await findOwnPick('user-a', '0045496590055')).toBeNull()
  })
})

describe('resolveBarcode', () => {
  const barcode = { code: '0045496590048', scanned: '0045496590048' }
  const cap = vi.fn(async () => {})
  beforeEach(() => cap.mockClear())

  it('prefers the user’s own pick to the shared cache and ScanDex', async () => {
    ownRows = [{ ownerId: 'user-a', code: barcode.code, igdbId: 7 }]
    cached = { igdbId: 26758, fetchedAt: new Date() }
    const result = await resolveBarcode('user-a', barcode, cap)
    expect(result.own).toBe(true)
    expect(result.match?.igdbId).toBe(7)
    expect(askScanDex).not.toHaveBeenCalled()
    expect(cap).not.toHaveBeenCalled()
  })

  it('overrides a ScanDex match for that user only', async () => {
    ownRows = [{ ownerId: 'user-a', code: barcode.code, igdbId: 7 }]
    cached = { igdbId: 26758, fetchedAt: new Date() }
    const other = await resolveBarcode('user-b', barcode, cap)
    expect(other.own).toBeUndefined()
    expect(other.match?.igdbId).toBe(26758)
  })

  it('uses the shared cache when the user has no pick', async () => {
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

  it('falls through to the cache when reading the picked game fails', async () => {
    ownRows = [{ ownerId: 'user-a', code: barcode.code, igdbId: 7 }]
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
    ownRows = [{ ownerId: 'user-a', code: barcode.code, igdbId: 7 }]
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
