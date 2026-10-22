import { z } from 'zod'
import type { CollectionSummary } from '../../../../shared/types/collection'
import { HEX_COLOUR } from '../../../../shared/utils/collection-colours'
import {
  allColumnsKnown,
  MAX_HIDDEN_COLUMNS,
} from '../../../../shared/utils/columns'

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
    color: z
      .string()
      .trim()
      .toLowerCase()
      .regex(HEX_COLOUR)
      .nullable()
      .optional(),
    visibility: z.enum(['private', 'public']).optional(),
    hiddenColumns: z
      .array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/))
      .max(MAX_HIDDEN_COLUMNS)
      .optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined))

export default defineEventHandler(async (event): Promise<CollectionSummary> => {
  const { user } = await authorize(
    event,
    'collection.update',
    collectionOf(event),
  )
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  if (
    body.hiddenColumns &&
    !allColumnsKnown(
      body.hiddenColumns,
      'collection',
      user.fields.map((field) => field.id),
    )
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown column' })
  }
  return updateCollection(user.id, id, {
    ...body,
    ...(body.hiddenColumns && {
      hiddenColumns: [...new Set(body.hiddenColumns)],
    }),
  })
})
