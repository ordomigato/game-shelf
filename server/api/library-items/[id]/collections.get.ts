import { z } from 'zod'
import type { CollectionLink } from '../../../../shared/types/collection'

const paramsSchema = z.object({ id: z.uuid() })

/**
 * The collections a game is in, for the question asked before taking it
 * off its last list, since that deletes it from them too.
 */
export default defineEventHandler(async (event): Promise<CollectionLink[]> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await findOrCreateUser(sub)
  return collectionsOfItem(user.id, id)
})
