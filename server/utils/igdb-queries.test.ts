import { describe, expect, it } from 'vitest'
import {
  buildSearchQuery,
  escapeApicalypseString,
  SEARCH_PAGE_SIZE,
  toGameSummary,
} from './igdb-queries'

describe('escapeApicalypseString', () => {
  it('escapes double quotes so a term cannot end the string early', () => {
    expect(escapeApicalypseString('say "hi"; fields *;')).toBe(
      'say \\"hi\\"; fields *;',
    )
  })

  it('escapes backslashes before quotes', () => {
    expect(escapeApicalypseString('a\\"b')).toBe('a\\\\\\"b')
  })

  it('turns control characters into spaces', () => {
    expect(escapeApicalypseString('zelda\n; limit 500')).toBe(
      'zelda ; limit 500',
    )
  })
})

describe('buildSearchQuery', () => {
  it('keeps the search term inside its string literal', () => {
    const query = buildSearchQuery('x"; fields *; limit 500; "', 1)
    expect(query).toContain('search "x\\"; fields *; limit 500; \\"";')
    expect(query).toContain(`limit ${SEARCH_PAGE_SIZE};`)
  })

  it('pages by offset', () => {
    expect(buildSearchQuery('zelda', 1)).toContain('offset 0;')
    expect(buildSearchQuery('zelda', 3)).toContain(
      `offset ${2 * SEARCH_PAGE_SIZE};`,
    )
  })

  it('leaves out DLC, mods and duplicate editions', () => {
    const query = buildSearchQuery('zelda', 1)
    expect(query).toContain('version_parent = null')
    expect(query).not.toMatch(/game_type = \([^)]*\b(1|5)\b/)
  })
})

describe('toGameSummary', () => {
  it('maps a full IGDB row', () => {
    expect(
      toGameSummary({
        id: 1022,
        name: 'The Legend of Zelda',
        cover: { image_id: 'co1uii' },
        first_release_date: 509_328_000,
        platforms: [
          { abbreviation: 'NES', name: 'Nintendo Entertainment System' },
          { name: 'Family Computer Disk System' },
        ],
      }),
    ).toEqual({
      id: 1022,
      name: 'The Legend of Zelda',
      coverId: 'co1uii',
      year: 1986,
      platforms: ['NES', 'Family Computer Disk System'],
    })
  })

  it('handles missing cover, date and platforms', () => {
    expect(toGameSummary({ id: 1, name: 'Unknown' })).toEqual({
      id: 1,
      name: 'Unknown',
      coverId: null,
      year: null,
      platforms: [],
    })
  })

  it('removes duplicate platform names', () => {
    const summary = toGameSummary({
      id: 2,
      name: 'Dupes',
      platforms: [
        { abbreviation: 'PC', name: 'PC' },
        { abbreviation: 'PC', name: 'Windows' },
      ],
    })
    expect(summary.platforms).toEqual(['PC'])
  })
})
