import { describe, expect, it, vi } from 'vitest'
import {
  askScanDex,
  mapScanDexResponse,
  otherForm,
  ScanDexError,
} from './scandex'

describe('mapScanDexResponse', () => {
  it('maps a match to the IGDB game and platform', () => {
    expect(
      mapScanDexResponse(200, {
        id: 87859,
        source: 'import',
        igdb_metadata: {
          id: 26758,
          name: 'Super Mario Odyssey',
          platform: { id: 130, name: 'Nintendo Switch' },
        },
      }),
    ).toEqual({
      kind: 'match',
      igdbId: 26758,
      platformId: 130,
      platformName: 'Nintendo Switch',
    })
  })

  it('keeps a match that names no platform', () => {
    expect(
      mapScanDexResponse(200, { igdb_metadata: { id: 5, name: 'X' } }),
    ).toEqual({
      kind: 'match',
      igdbId: 5,
      platformId: null,
      platformName: null,
    })
  })

  it('treats a 404 as an unknown barcode', () => {
    expect(
      mapScanDexResponse(404, { message: 'This barcode does not exist yet.' }),
    ).toEqual({ kind: 'none', notFound: true })
  })

  it('treats a known barcode with no game as no match', () => {
    expect(
      mapScanDexResponse(200, {
        id: 178182,
        source: 'import',
        status: 'unmatched',
        igdb_metadata: null,
      }),
    ).toEqual({ kind: 'none' })
    expect(mapScanDexResponse(200, { igdb_metadata: { id: 'x' } })).toEqual({
      kind: 'none',
    })
  })

  it('throws for server errors, limits and unreadable answers', () => {
    expect(() => mapScanDexResponse(500, null)).toThrow(ScanDexError)
    expect(() => mapScanDexResponse(503, { message: 'down' })).toThrow(
      ScanDexError,
    )
    expect(() => mapScanDexResponse(429, {})).toThrow(ScanDexError)
    expect(() => mapScanDexResponse(401, {})).toThrow(ScanDexError)
    expect(() => mapScanDexResponse(200, null)).toThrow(ScanDexError)
  })
})

describe('askScanDex', () => {
  const match = {
    kind: 'match',
    igdbId: 1,
    platformId: 2,
    platformName: 'X',
  } as const
  const notFound = { kind: 'none', notFound: true } as const

  it('swaps between the UPC and EAN forms', () => {
    expect(otherForm('036000291452')).toBe('0036000291452')
    expect(otherForm('0036000291452')).toBe('036000291452')
    expect(otherForm('5901234123457')).toBeNull()
  })

  it('asks once, in the scanned form, for a match', async () => {
    const one = vi.fn().mockResolvedValue(match)
    expect(await askScanDex('036000291452', one)).toEqual(match)
    expect(one).toHaveBeenCalledTimes(1)
    expect(one).toHaveBeenCalledWith('036000291452')
  })

  it('asks once for a known barcode with no game', async () => {
    const one = vi.fn().mockResolvedValue({ kind: 'none' })
    await askScanDex('0036000291452', one)
    expect(one).toHaveBeenCalledTimes(1)
  })

  it('tries the other form after a 404', async () => {
    const one = vi
      .fn()
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(match)
    expect(await askScanDex('036000291452', one)).toEqual(match)
    expect(one).toHaveBeenLastCalledWith('0036000291452')
  })

  it('keeps the first "none" when the second call fails', async () => {
    const one = vi
      .fn()
      .mockResolvedValueOnce(notFound)
      .mockRejectedValueOnce(new ScanDexError('down'))
    expect(await askScanDex('036000291452', one)).toEqual(notFound)
  })

  it('does not retry a barcode with no other form', async () => {
    const one = vi.fn().mockResolvedValue(notFound)
    await askScanDex('5901234123457', one)
    expect(one).toHaveBeenCalledTimes(1)
  })

  it('still throws when the first call fails', async () => {
    const one = vi.fn().mockRejectedValue(new ScanDexError('down'))
    await expect(askScanDex('036000291452', one)).rejects.toThrow(ScanDexError)
  })
})
