import type { GameDetails, GameSummary } from '../../shared/types/game'

export const SEARCH_PAGE_SIZE = 24
export const MAX_SEARCH_PAGE = 20
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

export function buildSearchQuery(term: string, page: number): string {
  const offset = (page - 1) * SEARCH_PAGE_SIZE
  return [
    `search "${escapeApicalypseString(term)}";`,
    'fields name, cover.image_id, first_release_date, platforms.abbreviation, platforms.name;',
    `where version_parent = null & game_type = (${SEARCHABLE_GAME_TYPES.join(',')});`,
    `limit ${SEARCH_PAGE_SIZE};`,
    `offset ${offset};`,
  ].join(' ')
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
    'involved_companies.publisher;',
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
