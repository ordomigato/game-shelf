import type { SearchFilterOptions } from '../../../shared/types/game'

/** IGDB's platform and genre lists change rarely, so they're kept a week. */
const filterOptions = defineCachedFunction(
  async (): Promise<SearchFilterOptions> => {
    const queries = buildFilterListQueries()
    const [platforms, genres] = await Promise.all([
      igdbRequest<{ id: number; name: string }[]>(
        'platforms',
        queries.platforms,
      ),
      igdbRequest<{ id: number; name: string }[]>('genres', queries.genres),
    ])
    const pick = ({ id, name }: { id: number; name: string }) => ({ id, name })
    return { platforms: platforms.map(pick), genres: genres.map(pick) }
  },
  { name: 'search-filters', maxAge: 60 * 60 * 24 * 7, swr: true },
)

/** The platforms and genres search can be narrowed to. */
export default defineEventHandler(
  async (event): Promise<SearchFilterOptions> => {
    const options = await filterOptions()
    setResponseHeader(
      event,
      'cache-control',
      's-maxage=86400, stale-while-revalidate',
    )
    return options
  },
)
