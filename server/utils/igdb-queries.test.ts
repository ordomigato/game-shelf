import { describe, expect, it } from 'vitest'
import {
  buildBrowseQuery,
  buildCatalogQuery,
  buildReleaseDatesQuery,
  releasePrecisionOf,
  buildFilterListQueries,
  CATALOG_BATCH_SIZE,
  buildGameQuery,
  buildMatchQuery,
  buildSearchQuery,
  escapeApicalypseString,
  MAX_SCREENSHOTS,
  pageOf,
  rankSearchResults,
  SEARCH_PAGE_SIZE,
  SEARCH_POOL_SIZE,
  toCatalogGame,
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

  it('has no filters unless asked', () => {
    const query = buildSearchQuery('zelda')
    expect(query).not.toContain('platforms =')
    expect(query).not.toContain('genres =')
    expect(query).not.toContain('first_release_date >')
  })

  it('filters by platform, genre and release years, both years included', () => {
    const query = buildSearchQuery('zelda', {
      platform: 19,
      genre: 31,
      fromYear: 1990,
      toYear: 1999,
    })
    expect(query).toContain(
      'where version_parent = null & game_type = (0,2,3,4,8,9,10,11) & platforms = (19) & genres = (31) & first_release_date >= 631152000 & first_release_date < 946684800;',
    )
  })

  it('takes one end of the year range on its own', () => {
    const query = buildSearchQuery('zelda', { fromYear: 2017 })
    expect(query).toContain('first_release_date >= 1483228800;')
    expect(query).not.toContain('first_release_date <')
  })
})

describe('buildBrowseQuery', () => {
  it('lists the best-known games that fit the filters, with no search', () => {
    const query = buildBrowseQuery({ platform: 19 })
    expect(query).not.toContain('search ')
    expect(query).toContain('platforms = (19)')
    expect(query).toContain('version_parent = null')
    expect(query).toContain('sort total_rating_count desc;')
    expect(query).toContain(`limit ${SEARCH_POOL_SIZE};`)
  })
})

describe('buildFilterListQueries', () => {
  it('lists platforms that hold games, by name', () => {
    const { platforms, genres } = buildFilterListQueries()
    expect(platforms).toContain('where platform_type = (1,2,4,5,6);')
    expect(platforms).toContain('sort name asc;')
    expect(genres).toContain('sort name asc;')
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

describe('buildMatchQuery', () => {
  it('searches like search does, for fewer results', () => {
    const query = buildMatchQuery('Say "Hi"')
    expect(query).toContain('search "Say \\"Hi\\"";')
    expect(query).toContain('where version_parent = null')
    expect(query).toMatch(/limit 10;$/)
  })
})

describe('buildCatalogQuery', () => {
  it('asks for the catalog fields of the given games', () => {
    expect(buildCatalogQuery([1, 2, 3])).toBe(
      'fields name, cover.image_id, first_release_date, genres.name, platforms.name, platforms.abbreviation, release_dates.date, release_dates.date_format; where id = (1,2,3); limit 500;',
    )
  })

  it('refuses ids that are not positive integers', () => {
    for (const id of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => buildCatalogQuery([1, id])).toThrow()
    }
  })

  it(`asks for 1 to ${CATALOG_BATCH_SIZE} games`, () => {
    expect(() => buildCatalogQuery([])).toThrow()
    const ids = Array.from({ length: CATALOG_BATCH_SIZE + 1 }, (_, i) => i + 1)
    expect(() => buildCatalogQuery(ids)).toThrow()
    expect(() => buildCatalogQuery(ids.slice(1))).not.toThrow()
  })
})

describe('toCatalogGame', () => {
  it('maps a game and the platforms it mentions', () => {
    expect(
      toCatalogGame({
        id: 1026,
        name: 'The Legend of Zelda: A Link to the Past',
        cover: { image_id: 'co3vzn' },
        first_release_date: 690_681_600,
        genres: [
          { id: 12, name: 'Role-playing (RPG)' },
          { id: 31, name: 'Adventure' },
        ],
        platforms: [
          { id: 19, name: 'Super Nintendo', abbreviation: 'SNES' },
          { id: 58, name: 'Super Famicom' },
        ],
      }),
    ).toEqual({
      game: {
        igdbId: 1026,
        name: 'The Legend of Zelda: A Link to the Past',
        coverId: 'co3vzn',
        releaseDate: '1991-11-21',
        releasePrecision: null,
        genres: ['Role-playing (RPG)', 'Adventure'],
        platformIds: [19, 58],
      },
      platforms: [
        { igdbId: 19, name: 'Super Nintendo', abbreviation: 'SNES' },
        { igdbId: 58, name: 'Super Famicom', abbreviation: null },
      ],
    })
  })

  it('gives the release day in UTC', () => {
    // 23:30 UTC on 31 December, already 1 January further east.
    const lateEvening = Date.UTC(1999, 11, 31, 23, 30) / 1000
    expect(
      toCatalogGame({ id: 1, name: 'x', first_release_date: lateEvening }).game
        .releaseDate,
    ).toBe('1999-12-31')
  })

  it('handles a game with almost nothing filled in', () => {
    expect(toCatalogGame({ id: 1, name: 'Bare' })).toEqual({
      game: {
        igdbId: 1,
        name: 'Bare',
        coverId: null,
        releaseDate: null,
        releasePrecision: null,
        genres: [],
        platformIds: [],
      },
      platforms: [],
    })
  })
})

describe('releasePrecisionOf', () => {
  const first = 1_320_000_000

  it('maps each IGDB date format', () => {
    const formats: [number, string][] = [
      [0, 'day'],
      [1, 'month'],
      [2, 'year'],
      [3, 'quarter'],
      [6, 'quarter'],
      [7, 'tbd'],
    ]
    for (const [date_format, precision] of formats) {
      expect(
        releasePrecisionOf({
          first_release_date: first,
          release_dates: [{ date: first, date_format }],
        }),
      ).toBe(precision)
    }
  })

  it('takes the release whose date is the first release date', () => {
    expect(
      releasePrecisionOf({
        first_release_date: first,
        release_dates: [
          { date: first + 100, date_format: 0 },
          { date: first, date_format: 2 },
        ],
      }),
    ).toBe('year')
  })

  it('falls back to the earliest dated release', () => {
    expect(
      releasePrecisionOf({
        first_release_date: first,
        release_dates: [
          { date: first + 100, date_format: 0 },
          { date: first + 50, date_format: 1 },
          { date_format: 7 },
        ],
      }),
    ).toBe('month')
  })

  it('is TBD for an undated game with a TBD release', () => {
    expect(releasePrecisionOf({ release_dates: [{ date_format: 7 }] })).toBe(
      'tbd',
    )
  })

  it('is unknown with no releases or an unknown format', () => {
    expect(releasePrecisionOf({ first_release_date: first })).toBeNull()
    expect(
      releasePrecisionOf({
        first_release_date: first,
        release_dates: [{ date: first, date_format: 99 }],
      }),
    ).toBeNull()
  })

  it('goes into toCatalogGame', () => {
    expect(
      toCatalogGame({
        id: 1,
        name: 'x',
        first_release_date: first,
        release_dates: [{ date: first, date_format: 1 }],
      }).game.releasePrecision,
    ).toBe('month')
  })
})

describe('buildReleaseDatesQuery', () => {
  it('asks only for the dates', () => {
    expect(buildReleaseDatesQuery([4, 5])).toBe(
      'fields first_release_date, release_dates.date, release_dates.date_format; where id = (4,5); limit 500;',
    )
  })
  it('refuses bad ids', () => {
    expect(() => buildReleaseDatesQuery([0])).toThrow()
  })
})
