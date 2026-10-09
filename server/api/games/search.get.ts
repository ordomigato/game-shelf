import { z } from 'zod'
import type {
  GameSearchResponse,
  GameSummary,
} from '../../../shared/types/game'
import type { IgdbGame } from '../../utils/igdb-queries'

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  page: z.coerce.number().int().min(1).max(MAX_SEARCH_PAGE).default(1),
})

/**
 * The ranked results for a term, cached for an hour and keyed by the
 * lowercased term, so "Zelda" and " zelda" share one entry and paging
 * through results costs no extra IGDB calls.
 */
const rankedSearch = defineCachedFunction(
  async (term: string): Promise<GameSummary[]> => {
    const games = await igdbRequest<IgdbGame[]>('games', buildSearchQuery(term))
    return rankSearchResults(games).map(toGameSummary)
  },
  {
    name: 'game-search',
    maxAge: 60 * 60,
    swr: true,
    getKey: (term: string) => term.toLowerCase(),
  },
)

export default defineEventHandler(
  async (event): Promise<GameSearchResponse> => {
    const { q, page } = await getValidatedQuery(event, querySchema.parse)
    const { items, hasMore } = pageOf(await rankedSearch(q), page)
    setResponseHeader(
      event,
      'cache-control',
      's-maxage=3600, stale-while-revalidate',
    )
    return { games: items, page, hasMore }
  },
)
