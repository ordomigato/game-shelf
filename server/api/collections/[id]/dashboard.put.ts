import { z } from 'zod'
import type { ChartWidget } from '../../../../shared/types/charts'
import { MAX_CHARTS } from '../../../../shared/utils/charts'

const paramsSchema = z.object({ id: z.uuid() })
const fieldId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
const measureSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('count') }),
  z.object({
    op: z.enum(['sum', 'average', 'min', 'max']),
    fieldId,
  }),
  z.object({ op: z.literal('percent'), fieldId }),
])
const widgetSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  kind: z.enum(['number', 'bar', 'pie', 'line']),
  title: z.string().trim().max(80),
  size: z.enum(['small', 'medium', 'large']),
  measure: measureSchema,
  groupBy: fieldId.optional(),
  timeline: z
    .object({
      source: z.union([z.literal('addedAt'), fieldId]),
      bucket: z.enum(['month', 'year']),
      cumulative: z.boolean(),
    })
    .optional(),
})
const bodySchema = z.object({
  dashboard: z.array(widgetSchema).max(MAX_CHARTS),
})

/**
 * Replaces a collection's charts. Only their shape is checked here: fields
 * can change later anyway, so the dashboard checks them when it draws.
 */
export default defineEventHandler(async (event): Promise<ChartWidget[]> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { dashboard } = await readValidatedBody(event, bodySchema.parse)
  const user = await findOrCreateUser(sub)
  return updateDashboard(user.id, id, dashboard)
})
