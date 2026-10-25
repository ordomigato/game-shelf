import { z } from 'zod'
import type { LibraryItem } from '../../../../shared/types/collection'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  /** Field id to value, for the user's fields. `null` clears. */
  values: z.record(z.string().max(100), z.unknown()),
})

/** Sets a game's values for the user's fields, wherever the game is listed. */
export default defineEventHandler(async (event): Promise<LibraryItem> => {
  const { user } = await authorize(event, 'library.write', itemOf(event))
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { values } = await readValidatedBody(event, bodySchema.parse)
  return updateLibraryItemValues(
    user.id,
    id,
    values,
    userLimits(user).textLength,
  )
})
