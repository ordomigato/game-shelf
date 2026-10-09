/** A game as shown in search results. */
export interface GameSummary {
  id: number
  name: string
  /** IGDB image id for the cover, or null when IGDB has no cover. */
  coverId: string | null
  /** Year of first release, or null when unknown. */
  year: number | null
  /** Short platform names, e.g. "NES", "PS5". */
  platforms: string[]
}

export interface GameSearchResponse {
  games: GameSummary[]
  page: number
  hasMore: boolean
}

/** A single game, as shown on its detail page. Everything comes from IGDB. */
export interface GameDetails {
  id: number
  name: string
  coverId: string | null
  /** First release date as `YYYY-MM-DD` (UTC), or null when unknown. */
  releaseDate: string | null
  summary: string | null
  /** Full platform names, e.g. "Super Nintendo Entertainment System". */
  platforms: string[]
  genres: string[]
  developers: string[]
  publishers: string[]
  /** IGDB image ids, at most `MAX_SCREENSHOTS`. */
  screenshotIds: string[]
  /** The game's page on igdb.com. */
  igdbUrl: string | null
}
