import { describe, expect, it } from 'vitest'
import { mapScanDexResponse, ScanDexError } from './scandex'

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
    ).toEqual({ kind: 'none' })
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
