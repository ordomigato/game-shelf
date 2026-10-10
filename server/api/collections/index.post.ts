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
  /** Copies a starter's fields. Leave out when using `blueprintId`. */
  starter: z.enum(STARTER_BLUEPRINTS).optional(),
  /** One of the user's blueprints, used as is. */
  blueprintId: z.uuid().optional(),
  /** With `blueprintId`: start from a copy of its fields instead. */
  copy: z.boolean().optional(),
})
const startSchema = bodySchema.refine(
  (body) => !(body.starter && body.blueprintId),
  { message: 'Send a starter or a blueprintId, not both' },
)

export default defineEventHandler(async (event): Promise<CollectionSummary> => {
  const { sub } = await requireAuth(event)
  const { title, description, starter, blueprintId, copy } =
    await readValidatedBody(event, startSchema.parse)
  const user = await findOrCreateUser(sub)
  const created = await createCollection(user.id, {
    title,
    description,
    ...(blueprintId ? { blueprintId, copy } : { starter: starter ?? 'blank' }),
  })
  setResponseStatus(event, 201)
  return created
})
