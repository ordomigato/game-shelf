import type { GameDetails, GameSummary } from '../../shared/types/game'
import type { ReleasePrecision } from '../../shared/utils/release-date'

export const SEARCH_PAGE_SIZE = 24
/** How many IGDB matches one search fetches and ranks. Pages slice this. */
export const SEARCH_POOL_SIZE = 96
export const MAX_SEARCH_PAGE = SEARCH_POOL_SIZE / SEARCH_PAGE_SIZE
export const MAX_SCREENSHOTS = 4

/**
 * IGDB `game_type` ids shown in search: main games, expansions, bundles,
 * standalone expansions, remakes, remasters, expanded games and ports.
 * DLC, mods, episodes, seasons, forks, packs and updates are left out.
 */
const SEARCHABLE_GAME_TYPES = [0, 2, 3, 4, 8, 9, 10, 11]

/** The fields of an IGDB `games` row that search asks for. */
export interface IgdbGame {
  id: number
  name: string
  cover?: { image_id: string }
  first_release_date?: number
  platforms?: { abbreviation?: string; name: string }[]
  total_rating_count?: number
}

/**
 * Makes user text safe inside an Apicalypse string literal: control
 * characters become spaces, and backslashes and double quotes are escaped.
 */
export function escapeApicalypseString(value: string): string {
  return value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

/**
 * Narrows a search. Ids are IGDB's (see `buildFilterListQueries`); years are
 * of first release, both ends included.
 */
export interface SearchFilters {
  platform?: number
  genre?: number
  fromYear?: number
  toYear?: number
}

/** Unix seconds at the start of a year, in UTC like IGDB's dates. */
const yearStart = (year: number) => Date.UTC(year, 0, 1) / 1000

const SEARCH_FIELDS =
  'fields name, cover.image_id, first_release_date, platforms.abbreviation, platforms.name, total_rating_count;'

/**
 * The `where` clause shared by search and browse: main games only, plus the
 * filters. Filters are numbers checked by the caller, so they go into the
 * query as they are.
 */
function whereClause(filters: SearchFilters): string {
  const where = [
    'version_parent = null',
    `game_type = (${SEARCHABLE_GAME_TYPES.join(',')})`,
  ]
  if (filters.platform) where.push(`platforms = (${filters.platform})`)
  if (filters.genre) where.push(`genres = (${filters.genre})`)
  if (filters.fromYear) {
    where.push(`first_release_date >= ${yearStart(filters.fromYear)}`)
  }
  if (filters.toYear) {
    where.push(`first_release_date < ${yearStart(filters.toYear + 1)}`)
  }
  return `where ${where.join(' & ')};`
}

/**
 * Fetches IGDB's top `SEARCH_POOL_SIZE` text matches for a term, with the
 * rating count that `rankSearchResults` needs.
 */
export function buildSearchQuery(
  term: string,
  filters: SearchFilters = {},
): string {
  return [
    `search "${escapeApicalypseString(term)}";`,
    SEARCH_FIELDS,
    whereClause(filters),
    `limit ${SEARCH_POOL_SIZE};`,
  ].join(' ')
}

/**
 * Browsing with filters and no term: the `SEARCH_POOL_SIZE` best-known
 * games that fit, by how many ratings they have. IGDB can sort here
 * because there's no `search`.
 */
export function buildBrowseQuery(filters: SearchFilters): string {
  return [
    SEARCH_FIELDS,
    whereClause(filters),
    'sort total_rating_count desc;',
    `limit ${SEARCH_POOL_SIZE};`,
  ].join(' ')
}

/**
 * IGDB `platform_type` ids offered as filters: consoles, arcade, operating
 * systems (PC, Mac, phones), portable consoles and home computers. Leaves
 * out type 3 (services like Steam) and platforms with no type.
 */
const FILTER_PLATFORM_TYPES = [1, 2, 4, 5, 6]

/** The queries for the platform and genre lists that search filters offer. */
export function buildFilterListQueries(): {
  platforms: string
  genres: string
} {
  return {
    platforms: `fields name; where platform_type = (${FILTER_PLATFORM_TYPES.join(',')}); sort name asc; limit 500;`,
    genres: 'fields name; sort name asc; limit 500;',
  }
}

/** Candidates fetched per name when matching an import to IGDB. */
export const MATCH_POOL_SIZE = 10

/**
 * Searches IGDB for one imported game's name, like search does but for
 * fewer results. (IGDB's multiquery, which batches queries, ignores
 * `search`, so each name is its own request.)
 */
export function buildMatchQuery(name: string): string {
  return buildSearchQuery(name).replace(
    `limit ${SEARCH_POOL_SIZE};`,
    `limit ${MATCH_POOL_SIZE};`,
  )
}

const POPULARITY_WEIGHT = 2
const RELEVANCE_DECAY = 25

/**
 * Reorders IGDB search matches so well-known games come first. IGDB orders
 * by text match only, and its search can't be sorted. Each game scores its
 * popularity (log of its rating count, so a few hits don't swamp
 * everything) minus a penalty that grows with its position in IGDB's text
 * ranking. Ties keep IGDB's order.
 */
export function rankSearchResults<T extends { total_rating_count?: number }>(
  games: T[],
): T[] {
  return games
    .map((game, index) => ({
      game,
      index,
      score:
        POPULARITY_WEIGHT * Math.log10((game.total_rating_count ?? 0) + 1) -
        index / RELEVANCE_DECAY,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ game }) => game)
}

/** One page of an already ranked result list. */
export function pageOf<T>(
  results: T[],
  page: number,
): { items: T[]; hasMore: boolean } {
  const start = (page - 1) * SEARCH_PAGE_SIZE
  return {
    items: results.slice(start, start + SEARCH_PAGE_SIZE),
    hasMore: start + SEARCH_PAGE_SIZE < results.length,
  }
}

export function toGameSummary(game: IgdbGame): GameSummary {
  const platforms = (game.platforms ?? []).map(
    (platform) => platform.abbreviation ?? platform.name,
  )
  return {
    id: game.id,
    name: game.name,
    coverId: game.cover?.image_id ?? null,
    year: game.first_release_date
      ? new Date(game.first_release_date * 1000).getUTCFullYear()
      : null,
    platforms: [...new Set(platforms)],
  }
}

/** The fields of an IGDB `games` row that the detail page asks for. */
export interface IgdbGameDetails extends IgdbGame {
  summary?: string
  url?: string
  release_dates?: { date?: number; date_format?: number }[]
  genres?: { name: string }[]
  involved_companies?: {
    company: { name: string }
    developer: boolean
    publisher: boolean
  }[]
  screenshots?: { image_id: string }[]
}

export function buildGameQuery(id: number): string {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error(`Invalid IGDB game id: ${id}`)
  }
  return [
    'fields name, summary, url, first_release_date, cover.image_id,',
    'platforms.name, genres.name, screenshots.image_id,',
    'involved_companies.company.name, involved_companies.developer,',
    'involved_companies.publisher,',
    'release_dates.date, release_dates.date_format;',
    `where id = ${id};`,
    'limit 1;',
  ].join(' ')
}

export function toGameDetails(game: IgdbGameDetails): GameDetails {
  const companies = game.involved_companies ?? []
  const companyNames = (role: 'developer' | 'publisher') => [
    ...new Set(companies.filter((c) => c[role]).map((c) => c.company.name)),
  ]
  return {
    id: game.id,
    name: game.name,
    coverId: game.cover?.image_id ?? null,
    releaseDate: game.first_release_date
      ? new Date(game.first_release_date * 1000).toISOString().slice(0, 10)
      : null,
    releasePrecision: releasePrecisionOf(game),
    summary: game.summary?.trim() || null,
    platforms: [...new Set((game.platforms ?? []).map((p) => p.name))],
    genres: (game.genres ?? []).map((genre) => genre.name),
    developers: companyNames('developer'),
    publishers: companyNames('publisher'),
    screenshotIds: (game.screenshots ?? [])
      .slice(0, MAX_SCREENSHOTS)
      .map((shot) => shot.image_id),
    igdbUrl: game.url ?? null,
  }
}

/** The most ids one catalog request asks for: IGDB's limit per request. */
export const CATALOG_BATCH_SIZE = 500

/** The fields of an IGDB `games` row that the catalog keeps. */
export interface IgdbCatalogGame {
  id: number
  name: string
  cover?: { image_id: string }
  first_release_date?: number
  /** `date_format` is a `date_formats` id, which IGDB doesn't expand here. */
  release_dates?: { date?: number; date_format?: number }[]
  genres?: { id: number; name: string }[]
  platforms?: { id: number; name: string; abbreviation?: string }[]
}

/**
 * IGDB `date_formats` ids (formerly `release_dates.category`) to how exact
 * the date is. Q1 to Q4 are 3 to 6.
 */
const DATE_FORMAT_PRECISION: Record<number, ReleasePrecision> = {
  0: 'day',
  1: 'month',
  2: 'year',
  3: 'quarter',
  4: 'quarter',
  5: 'quarter',
  6: 'quarter',
  7: 'tbd',
}

/**
 * How exact the game's first release date is. `first_release_date` is the
 * earliest of its `release_dates`, so the release with that same timestamp
 * says; failing that, the earliest dated one. A game with no date at all is
 * TBD if a release says so. Null when IGDB gives nothing to go on.
 */
export function releasePrecisionOf(
  game: Pick<IgdbCatalogGame, 'first_release_date' | 'release_dates'>,
): ReleasePrecision | null {
  const releases = game.release_dates ?? []
  const precisionOf = (release?: { date_format?: number }) =>
    release?.date_format === undefined
      ? null
      : (DATE_FORMAT_PRECISION[release.date_format] ?? null)
  const dated = releases.filter(
    (release): release is { date: number; date_format?: number } =>
      release.date !== undefined,
  )
  const exact = dated.find(
    (release) => release.date === game.first_release_date,
  )
  const earliest = dated.reduce<(typeof dated)[number] | undefined>(
    (best, release) => (!best || release.date < best.date ? release : best),
    undefined,
  )
  const chosen = exact ?? earliest
  if (chosen) return precisionOf(chosen)
  return releases.some((release) => precisionOf(release) === 'tbd')
    ? 'tbd'
    : null
}

/** A `games` row as read from IGDB, minus the timestamps. */
export interface CatalogGame {
  igdbId: number
  name: string
  coverId: string | null
  releaseDate: string | null
  releasePrecision: ReleasePrecision | null
  genres: string[]
  platformIds: number[]
}

/** A `platforms` row. */
export interface CatalogPlatform {
  igdbId: number
  name: string
  abbreviation: string | null
}

/** Reads up to `CATALOG_BATCH_SIZE` games by IGDB id, for the catalog. */
export function buildCatalogQuery(ids: number[]): string {
  if (!ids.length || ids.length > CATALOG_BATCH_SIZE) {
    throw new Error(`Expected 1 to ${CATALOG_BATCH_SIZE} ids`)
  }
  for (const id of ids) {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new Error(`Invalid IGDB game id: ${id}`)
    }
  }
  return [
    'fields name, cover.image_id, first_release_date, genres.name,',
    'platforms.name, platforms.abbreviation,',
    'release_dates.date, release_dates.date_format;',
    `where id = (${ids.join(',')});`,
    `limit ${CATALOG_BATCH_SIZE};`,
  ].join(' ')
}

/**
 * Reads only the release date and its precision for up to
 * `CATALOG_BATCH_SIZE` games, for `scripts/refresh-catalog-dates.ts`.
 */
export function buildReleaseDatesQuery(ids: number[]): string {
  buildCatalogQuery(ids) // the same checks on the ids
  return [
    'fields first_release_date, release_dates.date, release_dates.date_format;',
    `where id = (${ids.join(',')});`,
    `limit ${CATALOG_BATCH_SIZE};`,
  ].join(' ')
}

/** The catalog row for an IGDB game, and the platforms it mentions. */
export function toCatalogGame(game: IgdbCatalogGame): {
  game: CatalogGame
  platforms: CatalogPlatform[]
} {
  const platforms = game.platforms ?? []
  return {
    game: {
      igdbId: game.id,
      name: game.name,
      coverId: game.cover?.image_id ?? null,
      releaseDate:
        game.first_release_date === undefined
          ? null
          : new Date(game.first_release_date * 1000).toISOString().slice(0, 10),
      releasePrecision: releasePrecisionOf(game),
      genres: [...new Set((game.genres ?? []).map((genre) => genre.name))],
      platformIds: [...new Set(platforms.map((platform) => platform.id))],
    },
    platforms: platforms.map((platform) => ({
      igdbId: platform.id,
      name: platform.name,
      abbreviation: platform.abbreviation ?? null,
    })),
  }
}
