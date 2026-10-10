import { z } from 'zod'
import type { BlueprintDetail } from '../../../../shared/types/collection'

const paramsSchema = z.object({ id: z.uuid() })

/** One of the user's blueprints, with the collections that use it. */
export default defineEventHandler(async (event): Promise<BlueprintDetail> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await findOrCreateUser(sub)
  return getBlueprintDetail(user.id, id)
})
