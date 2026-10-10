import { z } from 'zod'
import type { ExplorePage } from '../../shared/types/collection'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
})

/** Everyone's public collections with games, most recently active first. */
export default defineEventHandler(async (event): Promise<ExplorePage> => {
  const { page } = await getValidatedQuery(event, querySchema.parse)
  return listExplore(page)
})
