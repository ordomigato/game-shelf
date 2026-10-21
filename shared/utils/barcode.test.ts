import { describe, expect, it } from 'vitest'
import {
  BARCODE_MATCH_TTL_MS,
  BARCODE_NO_MATCH_TTL_MS,
  barcodeCacheFresh,
  normalizeBarcode,
} from './barcode'

describe('normalizeBarcode', () => {
  it('accepts an EAN-13 as it is', () => {
    expect(normalizeBarcode('5901234123457')).toBe('5901234123457')
  })

  it('gives a 12-digit UPC and its EAN-13 the same key', () => {
    expect(normalizeBarcode('036000291452')).toBe('0036000291452')
    expect(normalizeBarcode('0036000291452')).toBe('0036000291452')
  })

  it('drops the leading 0 of a 14-digit GTIN', () => {
    expect(normalizeBarcode('00036000291452')).toBe('0036000291452')
    expect(normalizeBarcode('04006381333931')).toBe('4006381333931')
  })

  it('accepts an EAN-8 and a UPC-E, which becomes its UPC key', () => {
    expect(normalizeBarcode('73513537')).toBe('73513537')
    expect(normalizeBarcode('04252614')).toBe('0042100005264')
  })

  it('believes the scanner about 8-digit codes', () => {
    // 01234565 is a good EAN-8 and also a good UPC-E.
    expect(normalizeBarcode('01234565')).toBe('01234565')
    expect(normalizeBarcode('01234565', 'ean_8')).toBe('01234565')
    expect(normalizeBarcode('01234565', 'upc_e')).toBe('0012345000065')
    expect(normalizeBarcode('04252614', 'ean_8')).toBeNull()
    expect(normalizeBarcode('73513537', 'upc_e')).toBeNull()
  })

  it('ignores spaces', () => {
    expect(normalizeBarcode(' 5901 2341 23457 ')).toBe('5901234123457')
  })

  it('refuses a wrong check digit', () => {
    expect(normalizeBarcode('5901234123458')).toBeNull()
    expect(normalizeBarcode('036000291453')).toBeNull()
    expect(normalizeBarcode('73513538')).toBeNull()
  })

  it('refuses the wrong length and anything that is not digits', () => {
    expect(normalizeBarcode('')).toBeNull()
    expect(normalizeBarcode('123456789')).toBeNull()
    expect(normalizeBarcode('59012341234')).toBeNull()
    expect(normalizeBarcode('590123412345A')).toBeNull()
    expect(normalizeBarcode("5901234123457'; select 1")).toBeNull()
    expect(normalizeBarcode('59012341234570000')).toBeNull()
  })
})

describe('barcodeCacheFresh', () => {
  const now = new Date('2026-10-21T12:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms)
  const DAY = 24 * 60 * 60 * 1000

  it('reuses a match for 30 days', () => {
    expect(BARCODE_MATCH_TTL_MS).toBe(30 * DAY)
    expect(
      barcodeCacheFresh({ igdbId: 1, fetchedAt: ago(29 * DAY) }, now),
    ).toBe(true)
    expect(
      barcodeCacheFresh({ igdbId: 1, fetchedAt: ago(30 * DAY) }, now),
    ).toBe(false)
  })

  it('reuses "no match" for one day', () => {
    expect(BARCODE_NO_MATCH_TTL_MS).toBe(DAY)
    expect(
      barcodeCacheFresh({ igdbId: null, fetchedAt: ago(DAY - 1000) }, now),
    ).toBe(true)
    expect(
      barcodeCacheFresh({ igdbId: null, fetchedAt: ago(DAY + 1000) }, now),
    ).toBe(false)
  })
})
