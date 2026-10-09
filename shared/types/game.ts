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
