import type { GameDetails } from '../types/game'
import { igdbImageUrl } from './igdb-images'
import type { ReleasePrecision } from './release-date'

/** What search engines and link previews are told about the site. */
export const SITE_NAME = 'ThisPlayShelf'

/** Pages anyone can reach and search engines should list. */
export const INDEXABLE_PAGES = [
  '/',
  '/explore',
  '/about',
  '/pricing',
  '/privacy',
  '/contact',
] as const

/**
 * Only the real site is listed by search engines. Every other stage and a
 * local build have no production address (NUXT_PUBLIC_SITE_URL), so they
 * ask not to be indexed.
 */
export function isIndexable(siteUrl: string | undefined): boolean {
  return Boolean(siteUrl)
}

/** An absolute address for a path, without the query string or a trailing slash. */
export function canonicalUrl(site: string, path: string): string {
  const clean = path.split(/[?#]/)[0]!.replace(/\/+$/, '')
  return `${site.replace(/\/$/, '')}${clean || '/'}`
}

/**
 * The robots rule for a page, or undefined to leave it indexable. Search
 * results on the home page (`/?q=zelda`) are a different page for every
 * search, so they stay out of the index while their links are still followed.
 */
export function robotsFor(
  path: string,
  query: Record<string, unknown>,
): string | undefined {
  const isHome = (path.split(/[?#]/)[0] || '/').replace(/\/+$/, '') === ''
  // Only a real search. Tracking parameters (utm_*, fbclid) and `to` show
  // the home page, whose canonical link already drops them.
  const searching = typeof query.q === 'string' && query.q.trim() !== ''
  return isHome && searching ? 'noindex, follow' : undefined
}

/** JSON for a `<script type="application/ld+json">`, safe to put in HTML. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** The site's logo, which search engines may show beside its name. */
const logoUrl = (site: string) => `${site}/apple-touch-icon.png`

/** The site and who runs it, with the search box search engines may show. */
export function siteJsonLd(site: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${site}/#website`,
        name: SITE_NAME,
        url: `${site}/`,
        publisher: { '@id': `${site}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${site}/?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${site}/#organization`,
        name: SITE_NAME,
        url: `${site}/`,
        logo: logoUrl(site),
      },
    ],
  }
}

/**
 * A release date written as exactly as it is known, the way schema.org
 * allows: `2011-11-18`, `2011-11` or `2011`. A quarter is only known to the
 * year. Undefined when there is no date, or it isn't announced.
 */
export function datePublished(
  date: string | null,
  precision: ReleasePrecision | null,
): string | undefined {
  if (!date || precision === 'tbd' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return undefined
  }
  switch (precision) {
    case 'month':
      return date.slice(0, 7)
    case 'year':
    case 'quarter':
      return date.slice(0, 4)
    case 'day':
      return date
    default:
      // Not known how exact it is, so claim only the year.
      return date.slice(0, 4)
  }
}

/** The game's cover at a size big enough for a preview card. */
export const gameCoverUrl = (coverId: string) =>
  igdbImageUrl(coverId, 'cover_big_2x')

/** The size of `gameCoverUrl`'s image (IGDB's `cover_big_2x`). */
export const GAME_COVER_SIZE = { width: 528, height: 748 }

/** A game's page, as search engines read it. No ratings or reviews. */
export function gameJsonLd(game: GameDetails, site: string) {
  const published = datePublished(game.releaseDate, game.releasePrecision)
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.name,
    url: `${site}/games/${game.id}`,
    ...(game.coverId && { image: gameCoverUrl(game.coverId) }),
    ...(game.summary && { description: game.summary }),
    ...(published && { datePublished: published }),
    ...(game.genres.length && { genre: game.genres }),
    ...(game.platforms.length && { gamePlatform: game.platforms }),
  }
}

/** The part of a game that gets named in a list's structured data. */
export interface ListedGame {
  name: string
  /** The game's IGDB id, or null for a game added by hand. */
  igdbId: number | null
}

/**
 * A shared collection or list: a page about a list of games. Games with a
 * page of their own link to it.
 */
export function collectionJsonLd(input: {
  name: string
  url: string
  description?: string | null
  games: ListedGame[]
  site: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    url: input.url,
    ...(input.description && { description: input.description }),
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${input.site}/`,
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: input.games.length,
      itemListElement: input.games.map((game, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: game.name,
        ...(game.igdbId !== null && {
          url: `${input.site}/games/${game.igdbId}`,
        }),
      })),
    },
  }
}

const MIN_DESCRIPTION = 50
const MAX_DESCRIPTION = 160
const MAX_NAMED = 3

type Translate = (key: string, params?: Record<string, unknown>) => string

/**
 * A plain description of a game for search results, 50 to 160 characters:
 * its name, year and genres, where it is, and a nudge to track it. The year
 * and "Released on" are only for games already out. A game that is not out
 * yet, or has no date, names no year. Parts that don't fit are dropped,
 * platforms first.
 */
export function gameDescription(
  game: GameDetails,
  t: Translate,
  today = new Date(),
): string {
  const published = datePublished(game.releaseDate, game.releasePrecision)
  const out =
    !!game.releaseDate &&
    game.releasePrecision !== 'tbd' &&
    game.releaseDate <= today.toISOString().slice(0, 10)
  const year = out ? published?.slice(0, 4) : undefined
  const genres = game.genres.slice(0, MAX_NAMED).join(', ')
  const platforms = game.platforms.slice(0, MAX_NAMED).join(', ')
  const values = { name: game.name, year, genres }
  const plain = year ? t('seo.game.year', values) : t('seo.game.noYear', values)
  const withGenres = year
    ? t('seo.game.yearGenres', values)
    : t('seo.game.noYearGenres', values)
  const intro = genres ? withGenres : plain
  const track = t('seo.game.track')
  const where = out
    ? t('seo.game.platforms', { platforms })
    : game.releaseDate || game.releasePrecision === 'tbd'
      ? t('seo.game.platformsComing', { platforms })
      : t('seo.game.platformsOn', { platforms })
  const tries = [
    [intro, platforms && where, track],
    [intro, track],
    [plain, track],
  ].map((parts) => parts.filter(Boolean).join(' '))
  let text = tries.find((attempt) => attempt.length <= MAX_DESCRIPTION)
  text ??= tries.at(-1)!
  if (text.length < MIN_DESCRIPTION) text += ` ${t('seo.game.more')}`
  if (text.length <= MAX_DESCRIPTION) return text
  // A very long name: cut at a word and end with an ellipsis.
  const cut = text.slice(0, MAX_DESCRIPTION - 1)
  const space = cut.lastIndexOf(' ')
  return `${space > 0 ? cut.slice(0, space) : cut}…`
}
