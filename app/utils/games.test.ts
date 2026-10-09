import { describe, expect, it } from 'vitest'
import { formatPlatforms } from './games'

describe('formatPlatforms', () => {
  it('joins a short list', () => {
    expect(formatPlatforms(['NES', 'SNES'])).toBe('NES · SNES')
  })

  it('summarises platforms past the limit', () => {
    expect(formatPlatforms(['NES', 'SNES', 'Wii', 'WiiU', '3DS'])).toBe(
      'NES · SNES · Wii +2',
    )
  })

  it('returns an empty string for no platforms', () => {
    expect(formatPlatforms([])).toBe('')
  })
})
