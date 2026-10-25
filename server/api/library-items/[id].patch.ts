import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { LibraryItem } from '../../../shared/types/collection'
import { libraryItems } from '../../db/schema'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
})

/**
 * Renames a game the user added by hand. An IGDB game's name comes from the
 * catalog, so it can't be renamed (400).
 */
export default defineEventHandler(async (event): Promise<LibraryItem> => {
  const { user } = await authorize(event, 'library.write', itemOf(event))
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const item = await getOwnedItem(user.id, id)
  if (item.igdbId !== null) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only games added by hand can be renamed',
    })
  }
  const [updated] = await useDb()
    .update(libraryItems)
    .set(body)
    .where(eq(libraryItems.id, id))
    .returning()
  return toLibraryItem(updated!, null)
})
