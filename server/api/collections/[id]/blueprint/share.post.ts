import { z } from 'zod'
import type { Blueprint } from '../../../../../shared/types/collection'
import { blueprintNameProblem } from '../../../../../shared/utils/blueprint-names'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  name: z
    .string()
    .trim()
    .refine((name) => blueprintNameProblem(name) === null),
})

/**
 * Saves a collection's fields as a named set, so new collections can use
 * them. The collection keeps the same fields. 409 when the name is taken.
 */
export default defineEventHandler(async (event): Promise<Blueprint> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { name } = await readValidatedBody(event, bodySchema.parse)
  const user = await findOrCreateUser(sub)
  return shareCollectionFields(user.id, id, name)
})
