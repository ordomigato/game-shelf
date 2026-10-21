import { beforeEach, describe, expect, it, vi } from 'vitest'

const askScanDex = vi.fn()
vi.mock('./scandex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scandex')>()),
  askScanDex,
}))
vi.mock('./catalog', () => ({ ensureCatalogGames: vi.fn() }))
vi.mock('./collections', () => ({ platformNames: vi.fn() }))

// Nitro auto-imports these in the server.
vi.stubGlobal(
  'createError',
  (input: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input),
)

const DAY = 24 * 60 * 60 * 1000
let failSave = false
let cached: Record<string, unknown> | undefined
const saved: Record<string, unknown>[] = []
vi.stubGlobal('useDb', () => ({
  select: () => ({
    from: () => ({ where: async () => (cached ? [cached] : []) }),
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

const { lookupBarcode } = await import('./barcodes')
const { ScanDexError } = await import('./scandex')

const match = {
  kind: 'match',
  igdbId: 26758,
  platformId: 130,
  platformName: 'Nintendo Switch',
}

beforeEach(() => {
  cached = undefined
  saved.length = 0
  askScanDex.mockReset()
})

describe('lookupBarcode', () => {
  it('answers from the cache without asking ScanDex or counting a lookup', async () => {
    cached = {
      igdbId: 26758,
      platformId: 130,
      platformName: 'Nintendo Switch',
      fetchedAt: new Date(Date.now() - 29 * DAY),
    }
    const beforeScanDex = vi.fn()
    expect(await lookupBarcode('0045496590048', beforeScanDex)).toEqual(match)
    expect(askScanDex).not.toHaveBeenCalled()
    expect(beforeScanDex).not.toHaveBeenCalled()
  })

  it('asks again once a match is 30 days old, and keeps the new answer', async () => {
    cached = { igdbId: 1, fetchedAt: new Date(Date.now() - 31 * DAY) }
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
    cached = {
      igdbId: 1,
      platformId: 2,
      platformName: 'X',
      fetchedAt: new Date(Date.now() - 40 * DAY),
    }
    const answer = await lookupBarcode('0045496590048', async () => {
      throw Object.assign(new Error('Too many requests'), { statusCode: 429 })
    })
    expect(answer).toMatchObject({ kind: 'match', igdbId: 1 })
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
    cached = {
      igdbId: 26758,
      platformId: 130,
      platformName: 'Nintendo Switch',
      fetchedAt: new Date(Date.now() - 40 * DAY),
    }
    askScanDex.mockRejectedValue(new ScanDexError('down'))
    expect(await lookupBarcode('0045496590048')).toEqual(match)
  })
})
