import { z } from 'zod'
import type { LibraryItem } from '../../../../../shared/types/collection'

const paramsSchema = z.object({ id: z.uuid(), itemId: z.uuid() })
const bodySchema = z.object({
  /** Field id to value, for this collection's blueprint. `null` clears. */
  values: z.record(z.string().max(100), z.unknown()),
})

export default defineEventHandler(async (event): Promise<LibraryItem> => {
  const { sub } = await requireAuth(event)
  const { id, itemId } = await getValidatedRouterParams(
    event,
    paramsSchema.parse,
  )
  const { values } = await readValidatedBody(event, bodySchema.parse)
  const user = await findOrCreateUser(sub)
  return updateItemValues(user.id, id, itemId, values)
})
