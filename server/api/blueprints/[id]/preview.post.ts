import { z } from 'zod'
import type {
  Blueprint,
  BlueprintImpact,
} from '../../../../shared/types/collection'

const paramsSchema = z.object({ id: z.uuid() })

/**
 * What saving these fields on a blueprint would change, without saving:
 * the collections using it, and how many games would lose values.
 */
export default defineEventHandler(async (event): Promise<BlueprintImpact> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { fields, optionRenames } = await readValidatedBody(
    event,
    fieldsBodySchema.parse,
  )
  const user = await findOrCreateUser(sub)
  return previewBlueprintFields(
    user.id,
    id,
    fields as Blueprint['fields'],
    optionRenames,
  )
})
