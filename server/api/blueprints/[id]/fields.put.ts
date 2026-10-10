import { z } from 'zod'
import type { Blueprint } from '../../../../shared/types/collection'

const paramsSchema = z.object({ id: z.uuid() })

/**
 * Replaces a blueprint's fields, carrying stored values over. Every
 * collection using it changes.
 */
export default defineEventHandler(async (event): Promise<Blueprint> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { fields, optionRenames } = await readValidatedBody(
    event,
    fieldsBodySchema.parse,
  )
  const user = await findOrCreateUser(sub)
  return updateBlueprintFields(
    user.id,
    id,
    fields as Blueprint['fields'],
    optionRenames,
  )
})
