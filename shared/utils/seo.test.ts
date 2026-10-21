import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en.json'
import type { GameDetails } from '../types/game'
import {
  canonicalUrl,
  collectionJsonLd,
  datePublished,
  gameDescription,
  gameJsonLd,
  isIndexable,
  jsonLdScript,
  robotsFor,
  siteJsonLd,
} from './seo'

const site = 'https://thisplayshelf.com'
const t = (key: string, params: Record<string, unknown> = {}) => {
  const message = key
    .split('.')
    .reduce<unknown>((node, part) => (node as never)?.[part], en) as string
  return message.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params[name]),
  )
}

const zelda: GameDetails = {
  id: 1026,
  name: 'The Legend of Zelda: A Link to the Past',
  coverId: 'co3vzl',
  releaseDate: '1991-11-21',
  releasePrecision: 'day',
  summary: 'Venture back to Hyrule.',
  platforms: ['Super Nintendo Entertainment System', 'Wii', 'Wii U', 'GBA'],
  genres: ['Puzzle', 'Adventure'],
  developers: ['Nintendo EAD'],
  publishers: ['Nintendo'],
  screenshotIds: [],
  igdbUrl: null,
}

describe('canonicalUrl', () => {
  it('is absolute and leaves out the query, hash and trailing slash', () => {
    expect(canonicalUrl(site, '/')).toBe(`${site}/`)
    expect(canonicalUrl(site, '/?q=zelda')).toBe(`${site}/`)
    expect(canonicalUrl(site, '/explore?page=2#top')).toBe(`${site}/explore`)
    expect(canonicalUrl(`${site}/`, '/games/1026/')).toBe(`${site}/games/1026`)
  })
})

describe('robotsFor', () => {
  it('keeps search results on the home page out of the index', () => {
    expect(robotsFor('/', { q: 'zelda' })).toBe('noindex, follow')
    expect(robotsFor('/', { to: 'owned' })).toBe('noindex, follow')
  })

  it('leaves every other page alone', () => {
    expect(robotsFor('/', {})).toBeUndefined()
    expect(robotsFor('/explore', { page: '2' })).toBeUndefined()
    expect(robotsFor('/games/1026', { q: 'x' })).toBeUndefined()
  })
})

describe('isIndexable', () => {
  it('needs the production domain', () => {
    expect(isIndexable('https://thisplayshelf.com')).toBe(true)
    expect(isIndexable('')).toBe(false)
    expect(isIndexable(undefined)).toBe(false)
  })
})

describe('jsonLdScript', () => {
  it('cannot close the script tag it sits in', () => {
    const text = jsonLdScript({ name: '</script><script>alert(1)</script>' })
    expect(text).not.toContain('<')
    expect(JSON.parse(text).name).toBe('</script><script>alert(1)</script>')
  })
})

describe('siteJsonLd', () => {
  it('names the site, its logo and its search', () => {
    const [website, organization] = siteJsonLd(site)['@graph']
    expect(website).toMatchObject({
      '@type': 'WebSite',
      name: 'ThisPlayShelf',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${site}/?q={search_term_string}`,
      },
    })
    expect(organization).toMatchObject({
      '@type': 'Organization',
      name: 'ThisPlayShelf',
      logo: `${site}/apple-touch-icon.png`,
    })
  })
})

describe('datePublished', () => {
  it('is as exact as the date is known', () => {
    expect(datePublished('2011-11-18', 'day')).toBe('2011-11-18')
    expect(datePublished('2011-11-01', 'month')).toBe('2011-11')
    expect(datePublished('2011-01-01', 'year')).toBe('2011')
    expect(datePublished('2026-10-01', 'quarter')).toBe('2026')
    expect(datePublished('2011-11-18', null)).toBe('2011')
  })

  it('is left out when there is no date', () => {
    expect(datePublished(null, null)).toBeUndefined()
    expect(datePublished('2030-01-01', 'tbd')).toBeUndefined()
  })
})

describe('gameJsonLd', () => {
  it('describes a video game, with no ratings or reviews', () => {
    const data = gameJsonLd(zelda, site)
    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: zelda.name,
      url: `${site}/games/1026`,
      image:
        'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co3vzl.jpg',
      description: 'Venture back to Hyrule.',
      datePublished: '1991-11-21',
      genre: ['Puzzle', 'Adventure'],
      gamePlatform: zelda.platforms,
    })
    expect(JSON.stringify(data)).not.toMatch(/rating|review/i)
  })

  it('leaves out what is not known', () => {
    const data = gameJsonLd(
      {
        ...zelda,
        coverId: null,
        releaseDate: null,
        releasePrecision: null,
        summary: null,
        genres: [],
        platforms: [],
      },
      site,
    )
    expect(Object.keys(data)).toEqual(['@context', '@type', 'name', 'url'])
  })
})

describe('collectionJsonLd', () => {
  it('lists the games, linking those with a page of their own', () => {
    const data = collectionJsonLd({
      name: 'NES Games · Retro Fan',
      url: `${site}/u/retro_fan/shelf/nes`,
      description: '2 games',
      games: [
        { name: 'Metroid', igdbId: 1 },
        { name: 'My own game', igdbId: null },
      ],
      site,
    })
    expect(data['@type']).toBe('CollectionPage')
    expect(data.mainEntity).toEqual({
      '@type': 'ItemList',
      numberOfItems: 2,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Metroid',
          url: `${site}/games/1`,
        },
        { '@type': 'ListItem', position: 2, name: 'My own game' },
      ],
    })
  })
})

describe('gameDescription', () => {
  it('drops the platforms first when it runs long', () => {
    expect(gameDescription(zelda, t)).toBe(
      'The Legend of Zelda: A Link to the Past (1991): Puzzle, Adventure. Track it in your ThisPlayShelf collection.',
    )
  })

  it('names the game, year, genres and platforms when they fit', () => {
    const text = gameDescription(
      { ...zelda, name: 'Metroid', platforms: ['NES', 'Wii'] },
      t,
    )
    expect(text).toBe(
      'Metroid (1991): Puzzle, Adventure. Released on NES, Wii. Track it in your ThisPlayShelf collection.',
    )
  })

  it('stays between 50 and 160 characters', () => {
    const cases: GameDetails[] = [
      zelda,
      { ...zelda, name: 'Go', genres: [], platforms: [], releaseDate: null },
      { ...zelda, name: 'X'.repeat(300) },
      { ...zelda, genres: [], platforms: ['PC'] },
    ]
    for (const game of cases) {
      const { length } = gameDescription(game, t)
      expect(length).toBeGreaterThanOrEqual(50)
      expect(length).toBeLessThanOrEqual(160)
    }
  })
})

describe('the pages’ descriptions', () => {
  it('are 50 to 160 characters, in plain language', () => {
    for (const [page, text] of Object.entries(en.seo.descriptions)) {
      expect(text.length, page).toBeGreaterThanOrEqual(50)
      expect(text.length, page).toBeLessThanOrEqual(160)
      expect(text, page).not.toMatch(/[—–;]/)
    }
  })
})
