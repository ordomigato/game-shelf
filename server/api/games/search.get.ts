import { z } from 'zod'
import type {
  GameSearchResponse,
  GameSummary,
} from '../../../shared/types/game'
import { FILTER_YEAR_RANGE } from '../../../shared/utils/search-filters'
import type { IgdbGame, SearchFilters } from '../../utils/igdb-queries'

const id = z.coerce.number().int().positive().max(1_000_000).optional()
const year = z.coerce
  .number()
  .int()
  .min(FILTER_YEAR_RANGE.min)
  .max(FILTER_YEAR_RANGE.max)
  .optional()

const querySchema = z
  .object({
    q: z.string().trim().min(2).max(100),
    page: z.coerce.number().int().min(1).max(MAX_SEARCH_PAGE).default(1),
    platform: id,
    genre: id,
    from: year,
    until: year,
  })
  .refine((query) => !query.from || !query.until || query.from <= query.until, {
    message: 'from is after until',
  })

/**
 * The ranked results for a term and filters, cached for an hour and keyed
 * by the lowercased term and the filters, so "Zelda" and " zelda" share one
 * entry and paging through results costs no extra IGDB calls.
 */
const rankedSearch = defineCachedFunction(
  async (term: string, filters: SearchFilters): Promise<GameSummary[]> => {
    const games = await igdbRequest<IgdbGame[]>(
      'games',
      buildSearchQuery(term, filters),
    )
    return rankSearchResults(games).map(toGameSummary)
  },
  {
    name: 'game-search',
    maxAge: 60 * 60,
    swr: true,
    getKey: (term: string, filters: SearchFilters) =>
      [
        term.toLowerCase(),
        filters.platform ?? '',
        filters.genre ?? '',
        filters.fromYear ?? '',
        filters.toYear ?? '',
      ].join('|'),
  },
)

export default defineEventHandler(
  async (event): Promise<GameSearchResponse> => {
    const { q, page, platform, genre, from, until } = await getValidatedQuery(
      event,
      querySchema.parse,
    )
    const filters = { platform, genre, fromYear: from, toYear: until }
    const { items, hasMore } = pageOf(await rankedSearch(q, filters), page)
    setResponseHeader(
      event,
      'cache-control',
      's-maxage=3600, stale-while-revalidate',
    )
    return { games: items, page, hasMore }
  },
)
