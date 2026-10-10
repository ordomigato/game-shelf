import { z } from 'zod'
import type { CollectionSummary } from '../../../../shared/types/collection'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((title) => collectionTitleProblem(title) === null)
      .optional(),
    description: z
      .string()
      .trim()
      .max(500)
      .transform((value) => value || null)
      .nullable()
      .optional(),
    visibility: z.enum(['private', 'public']).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined))

export default defineEventHandler(async (event): Promise<CollectionSummary> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const user = await findOrCreateUser(sub)
  return updateCollection(user.id, id, body)
})
