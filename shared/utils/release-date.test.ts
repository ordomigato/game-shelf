import { describe, expect, it } from 'vitest'
import { formatReleased, releaseSortDate } from './release-date'

const t = (key: string, params?: Record<string, unknown>) =>
  key === 'table.releasedTbd' ? 'TBD' : `Q${params?.quarter} ${params?.year}`

describe('formatReleased', () => {
  it('shows the whole date for a day', () => {
    expect(formatReleased('2011-11-18', 'day', 'en', t)).toBe('Nov 18, 2011')
  })
  it('shows the month and year for a month', () => {
    expect(formatReleased('2011-11-01', 'month', 'en', t)).toBe('Nov 2011')
  })
  it('shows only the year for a year', () => {
    expect(formatReleased('2011-01-01', 'year', 'en', t)).toBe('2011')
  })
  it('shows the quarter the date falls in', () => {
    expect(formatReleased('2026-10-01', 'quarter', 'en', t)).toBe('Q4 2026')
    expect(formatReleased('2026-03-31', 'quarter', 'en', t)).toBe('Q1 2026')
  })
  it('shows TBD, with or without a date', () => {
    expect(formatReleased(null, 'tbd', 'en', t)).toBe('TBD')
    expect(formatReleased('2030-12-31', 'tbd', 'en', t)).toBe('TBD')
  })
  it('falls back to the full date when the precision is unknown', () => {
    expect(formatReleased('2011-11-18', null, 'en', t)).toBe('Nov 18, 2011')
  })
  it('follows the locale and ignores the time zone', () => {
    expect(formatReleased('2011-11-18', 'day', 'de', t)).toBe('18.11.2011')
    expect(formatReleased('2011-01-01', 'year', 'en', t)).toBe('2011')
  })
  it('shows nothing without a date', () => {
    expect(formatReleased(null, null, 'en', t)).toBeNull()
    expect(formatReleased(null, 'day', 'en', t)).toBeNull()
  })
})

describe('releaseSortDate', () => {
  it('leaves TBD and missing dates out so they sort last', () => {
    expect(releaseSortDate('2030-01-01', 'tbd')).toBeUndefined()
    expect(releaseSortDate(null, null)).toBeUndefined()
    expect(releaseSortDate('2011-11-18', 'day')).toBe('2011-11-18')
  })
})
