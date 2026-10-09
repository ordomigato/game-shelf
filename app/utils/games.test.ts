import { describe, expect, it } from 'vitest'
import { summarizePlatforms } from './games'

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
