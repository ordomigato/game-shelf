import { z } from 'zod'
import type { LibraryItem } from '../../../../../shared/types/collection'

const paramsSchema = z.object({ id: z.uuid(), itemId: z.uuid() })
const bodySchema = z.object({
  /** Field id to value, for the user's fields. `null` clears. */
  values: z.record(z.string().max(100), z.unknown()),
})

export default defineEventHandler(async (event): Promise<LibraryItem> => {
  const { user, subject } = await authorize(
    event,
    'collection.update',
    collectionOf(event),
  )
  const { id, itemId } = await getValidatedRouterParams(
    event,
    paramsSchema.parse,
  )
  const { values } = await readValidatedBody(event, bodySchema.parse)
  assertCan(subject, 'library.write', await itemResource(itemId))
  return updateItemValues(user.id, id, itemId, values)
})
