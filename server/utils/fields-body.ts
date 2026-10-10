import { z } from 'zod'
import { FIELD_TYPES, MAX_FIELDS } from '../../shared/utils/field-changes'

/**
 * The body for saving (or previewing) a list of fields. Sizes are capped
 * here. `fieldsProblem` checks the finer rules.
 */
export const fieldsBodySchema = z.object({
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
