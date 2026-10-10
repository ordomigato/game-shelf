import { z } from 'zod'
import type { Blueprint } from '../../../../shared/types/collection'
import { blueprintNameProblem } from '../../../../shared/utils/blueprint-names'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  name: z
    .string()
    .trim()
    .refine((name) => blueprintNameProblem(name) === null),
})

/** Renames one of the user's blueprints. */
export default defineEventHandler(async (event): Promise<Blueprint> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { name } = await readValidatedBody(event, bodySchema.parse)
  const user = await findOrCreateUser(sub)
  return renameBlueprint(user.id, id, name)
})
