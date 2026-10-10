import { z } from 'zod'
import type { CollectionSummary } from '../../../shared/types/collection'
import { STARTER_BLUEPRINTS } from '../../../shared/utils/starter-blueprints'

const bodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((title) => collectionTitleProblem(title) === null),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((value) => value || null)
    .nullable()
    .default(null),
  starter: z.enum(STARTER_BLUEPRINTS).default('blank'),
})

export default defineEventHandler(async (event): Promise<CollectionSummary> => {
  const { sub } = await requireAuth(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const user = await findOrCreateUser(sub)
  const created = await createCollection(user.id, body)
  setResponseStatus(event, 201)
  return created
})
