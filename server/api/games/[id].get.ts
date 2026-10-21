import { z } from 'zod'
import type { GameDetails } from '../../../shared/types/game'
import type { IgdbGameDetails } from '../../utils/igdb-queries'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
})

/**
 * Game details barely change, so each game is cached for a day. The header
 * Nitro adds (`s-maxage=86400, stale-while-revalidate=604800`) lets
 * CloudFront keep it too, so a repeat visit costs no IGDB call. Same for
 * every viewer, so it's safe to share. Errors are not cached.
 */
export default defineCachedEventHandler(
  async (event): Promise<GameDetails> => {
    const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
    const [game] = await igdbRequest<IgdbGameDetails[]>(
      'games',
      buildGameQuery(id),
    )
    if (!game) {
      throw createError({ statusCode: 404, statusMessage: 'Game not found' })
    }
    return toGameDetails(game)
  },
  {
    name: 'game-details',
    maxAge: 60 * 60 * 24,
    swr: true,
    staleMaxAge: 60 * 60 * 24 * 7,
    getKey: (event) => String(getRouterParam(event, 'id') ?? ''),
  },
)
