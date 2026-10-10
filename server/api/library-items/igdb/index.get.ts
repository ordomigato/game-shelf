import { z } from 'zod'

const querySchema = z.object({
  ids: z
    .string()
    .transform((value) => value.split(',').filter(Boolean).map(Number))
    .pipe(z.array(z.number().int().positive()).max(100)),
})

/**
 * Of the IGDB games in `?ids=1,2,3`, the ones already in one of the user's
 * collections. Search results use it to mark games the user has.
 */
export default defineEventHandler(async (event): Promise<number[]> => {
  const { sub } = await requireAuth(event)
  const { ids } = await getValidatedQuery(event, querySchema.parse)
  const user = await findOrCreateUser(sub)
  return trackedIgdbIds(user.id, ids)
})
