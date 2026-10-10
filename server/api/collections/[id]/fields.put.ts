import { z } from 'zod'
import type { Blueprint } from '../../../../shared/types/collection'
import { FIELD_TYPES, MAX_FIELDS } from '../../../../shared/utils/field-changes'

const paramsSchema = z.object({ id: z.uuid() })
// Sizes are capped here. `fieldsProblem` checks the finer rules.
const bodySchema = z.object({
  fields: z
    .array(
      z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
        name: z.string().max(200),
        type: z.enum(FIELD_TYPES as [string, ...string[]]),
        options: z.array(z.string().max(200)).max(100).optional(),
        currency: z.string().max(3).optional(),
        scale: z
          .union([z.literal(5), z.literal(10), z.literal(100)])
          .optional(),
      }),
    )
    .max(MAX_FIELDS),
  /** Per field id, select options renamed from old to new. */
  optionRenames: z
    .record(
      z.string().max(64),
      z.record(z.string().max(200), z.string().max(200)),
    )
    .optional(),
})

/** Replaces a collection's fields, carrying stored values over. */
export default defineEventHandler(async (event): Promise<Blueprint> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { fields, optionRenames } = await readValidatedBody(
    event,
    bodySchema.parse,
  )
  const user = await findOrCreateUser(sub)
  return updateCollectionFields(
    user.id,
    id,
    fields as Blueprint['fields'],
    optionRenames,
  )
})
