import { z } from 'zod'
import {
  allColumnsKnown,
  MAX_HIDDEN_COLUMNS,
} from '../../../../shared/utils/columns'

const paramsSchema = z.object({ list: z.enum(['owned', 'wishlist']) })
const bodySchema = z.object({
  hidden: z
    .array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/))
    .max(MAX_HIDDEN_COLUMNS),
})

/** Saves which columns the signed-in user hides on Owned or the Wishlist. */
export default defineEventHandler(async (event): Promise<string[]> => {
  const { user } = await authorize(event, 'account.update')
  const { list } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { hidden } = await readValidatedBody(event, bodySchema.parse)
  const fieldIds = user.fields.map((field) => field.id)
  if (!allColumnsKnown(hidden, 'list', fieldIds)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown column' })
  }
  return setListColumns(user, list, [...new Set(hidden)])
})
