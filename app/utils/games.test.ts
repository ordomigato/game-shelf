import { describe, expect, it } from 'vitest'
import { formatReleaseDate, summarizePlatforms } from './games'

describe('summarizePlatforms', () => {
  it('shows a short list in full', () => {
    expect(summarizePlatforms(['NES', 'SNES'])).toEqual({
      shown: ['NES', 'SNES'],
      hiddenCount: 0,
    })
  })

  it('counts platforms past the limit', () => {
    expect(summarizePlatforms(['NES', 'SNES', 'Wii', 'WiiU', '3DS'])).toEqual({
      shown: ['NES', 'SNES', 'Wii'],
      hiddenCount: 2,
    })
  })

  it('handles no platforms', () => {
    expect(summarizePlatforms([])).toEqual({ shown: [], hiddenCount: 0 })
  })
})

describe('formatReleaseDate', () => {
  it('formats a date in words, without shifting the day', () => {
    expect(formatReleaseDate('1991-11-21')).toBe('November 21, 1991')
    expect(formatReleaseDate('2000-01-01')).toBe('January 1, 2000')
  })
})
