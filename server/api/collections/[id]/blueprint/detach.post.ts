import { z } from 'zod'
import type { Blueprint } from '../../../../../shared/types/collection'

const paramsSchema = z.object({ id: z.uuid() })

/**
 * Gives a collection its own copy of the blueprint it uses. Its other
 * collections keep the set.
 */
export default defineEventHandler(async (event): Promise<Blueprint> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await findOrCreateUser(sub)
  return detachCollectionFields(user.id, id)
})
