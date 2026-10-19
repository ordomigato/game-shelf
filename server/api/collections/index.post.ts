import { z } from 'zod'
import type { CollectionSummary } from '../../../shared/types/collection'
import { HEX_COLOUR } from '../../../shared/utils/collection-colours'

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
  color: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HEX_COLOUR)
    .nullable()
    .default(null),
})

export default defineEventHandler(async (event): Promise<CollectionSummary> => {
  const { sub } = await requireAuth(event)
  const { title, description, color } = await readValidatedBody(
    event,
    bodySchema.parse,
  )
  const user = await findOrCreateUser(sub)
  await assertCollectionRoom(user.id, userLimits(user))
  const created = await createCollection(user.id, {
    title,
    description,
    color,
  })
  setResponseStatus(event, 201)
  return created
})
