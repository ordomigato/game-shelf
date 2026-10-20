import { describe, expect, it } from 'vitest'
import { genresText, platformsOf } from './platforms'

const catalogPlatforms = [
  { id: 4, name: 'N64' },
  { id: 19, name: 'SNES' },
  { id: 7, name: 'Wii' },
]

describe('platformsOf', () => {
  it('splits the catalog platforms into owned and wanted, keeping their order', () => {
    expect(
      platformsOf({ catalogPlatforms, ownedOn: [7, 4], wantedOn: [19] }),
    ).toEqual({
      owned: [catalogPlatforms[0], catalogPlatforms[2]],
      wanted: [catalogPlatforms[1]],
    })
  })

  it('leaves out ids the catalog no longer lists', () => {
    expect(
      platformsOf({ catalogPlatforms, ownedOn: [99], wantedOn: [] }),
    ).toEqual({ owned: [], wanted: [] })
  })

  it('has nothing for a visitor or a game added by hand', () => {
    expect(platformsOf({})).toEqual({ owned: [], wanted: [] })
    expect(
      platformsOf({ catalogPlatforms: [], ownedOn: [], wantedOn: [] }),
    ).toEqual({ owned: [], wanted: [] })
  })
})

describe('genresText', () => {
  it('joins genres with commas', () => {
    expect(genresText(['Adventure', 'Puzzle'])).toBe('Adventure, Puzzle')
    expect(genresText([])).toBe('')
  })
})
