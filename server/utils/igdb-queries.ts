import type { GameSummary } from '../../shared/types/game'

export const SEARCH_PAGE_SIZE = 24
export const MAX_SEARCH_PAGE = 20

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
