import { z } from 'zod'
import type { GameSearchResponse } from '../../../shared/types/game'
import type { IgdbGame } from '../../utils/igdb-queries'

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  page: z.coerce.number().int().min(1).max(MAX_SEARCH_PAGE).default(1),
})

export default defineEventHandler(
  async (event): Promise<GameSearchResponse> => {
    const { q, page } = await getValidatedQuery(event, querySchema.parse)
    const games = await igdbRequest<IgdbGame[]>(
      'games',
      buildSearchQuery(q, page),
    )
    return {
      games: games.map(toGameSummary),
      page,
      hasMore: games.length === SEARCH_PAGE_SIZE,
    }
  },
)
