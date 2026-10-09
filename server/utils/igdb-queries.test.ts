import { describe, expect, it } from 'vitest'
import {
  buildGameQuery,
  buildSearchQuery,
  escapeApicalypseString,
  MAX_SCREENSHOTS,
  pageOf,
  rankSearchResults,
  SEARCH_PAGE_SIZE,
  SEARCH_POOL_SIZE,
  toGameDetails,
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
    const query = buildSearchQuery('x"; fields *; limit 500; "')
    expect(query).toContain('search "x\\"; fields *; limit 500; \\"";')
    expect(query).toContain(`limit ${SEARCH_POOL_SIZE};`)
  })

  it('asks for the rating count used for ranking', () => {
    expect(buildSearchQuery('zelda')).toContain('total_rating_count')
  })

  it('leaves out DLC, mods and duplicate editions', () => {
    const query = buildSearchQuery('zelda')
    expect(query).toContain('version_parent = null')
    expect(query).not.toMatch(/game_type = \([^)]*\b(1|5)\b/)
  })
})

describe('rankSearchResults', () => {
  type Ranked = { name: string; total_rating_count?: number }

  it('moves a well-known game above obscure better text matches', () => {
    const ranked = rankSearchResults<Ranked>([
      { name: 'Mario & Sonic', total_rating_count: 42 },
      { name: 'Mario Bros.', total_rating_count: 48 },
      { name: 'Super Mario 64', total_rating_count: 2084 },
    ])
    expect(ranked[0]!.name).toBe('Super Mario 64')
  })

  it('keeps IGDB order between games with no ratings', () => {
    const ranked = rankSearchResults<Ranked>([
      { name: 'first' },
      { name: 'second' },
      { name: 'third' },
    ])
    expect(ranked.map((g) => g.name)).toEqual(['first', 'second', 'third'])
  })

  it('lets a strong text match beat a slightly more popular weak one', () => {
    const games: Ranked[] = [
      { name: 'Exact match', total_rating_count: 500 },
      ...Array.from({ length: 60 }, (_, i) => ({ name: `filler ${i}` })),
      { name: 'Far down', total_rating_count: 600 },
    ]
    expect(rankSearchResults(games)[0]!.name).toBe('Exact match')
  })
})

describe('pageOf', () => {
  const results = Array.from({ length: 50 }, (_, i) => i)

  it('slices pages and says whether more follow', () => {
    expect(pageOf(results, 1)).toEqual({
      items: results.slice(0, SEARCH_PAGE_SIZE),
      hasMore: true,
    })
    expect(pageOf(results, 3)).toEqual({
      items: results.slice(48),
      hasMore: false,
    })
  })

  it('returns an empty page past the end', () => {
    expect(pageOf(results, 4)).toEqual({ items: [], hasMore: false })
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

describe('buildGameQuery', () => {
  it('asks for one game by id', () => {
    const query = buildGameQuery(1026)
    expect(query).toContain('where id = 1026;')
    expect(query).toContain('limit 1;')
  })

  it('rejects ids that are not positive whole numbers', () => {
    expect(() => buildGameQuery(0)).toThrow()
    expect(() => buildGameQuery(1.5)).toThrow()
    expect(() => buildGameQuery(Number.NaN)).toThrow()
  })
})

describe('toGameDetails', () => {
  it('splits companies into developers and publishers', () => {
    const details = toGameDetails({
      id: 1026,
      name: 'A Link to the Past',
      involved_companies: [
        {
          company: { name: 'Nintendo EAD' },
          developer: true,
          publisher: false,
        },
        { company: { name: 'Nintendo' }, developer: false, publisher: true },
        { company: { name: 'St. GIGA' }, developer: false, publisher: true },
        { company: { name: 'Nintendo' }, developer: false, publisher: true },
      ],
    })
    expect(details.developers).toEqual(['Nintendo EAD'])
    expect(details.publishers).toEqual(['Nintendo', 'St. GIGA'])
  })

  it('formats the release date as a UTC day', () => {
    expect(
      toGameDetails({ id: 1, name: 'x', first_release_date: 690_681_600 })
        .releaseDate,
    ).toBe('1991-11-21')
  })

  it(`keeps at most ${MAX_SCREENSHOTS} screenshots`, () => {
    const screenshots = Array.from({ length: 7 }, (_, i) => ({
      image_id: `s${i}`,
    }))
    expect(
      toGameDetails({ id: 1, name: 'x', screenshots }).screenshotIds,
    ).toEqual(['s0', 's1', 's2', 's3'])
  })

  it('handles a game with almost nothing filled in', () => {
    expect(toGameDetails({ id: 1, name: 'Bare', summary: '  ' })).toEqual({
      id: 1,
      name: 'Bare',
      coverId: null,
      releaseDate: null,
      summary: null,
      platforms: [],
      genres: [],
      developers: [],
      publishers: [],
      screenshotIds: [],
      igdbUrl: null,
    })
  })
})
