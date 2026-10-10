import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { LibraryItem } from '../../../shared/types/collection'
import { libraryItems } from '../../db/schema'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    coverId: z.string().trim().max(100).nullable().optional(),
  })
  .refine((body) => body.name !== undefined || body.coverId !== undefined)

/** Edits the user's own copy of a game. Its IGDB link is kept. */
export default defineEventHandler(async (event): Promise<LibraryItem> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const user = await findOrCreateUser(sub)
  await getOwnedItem(user.id, id)
  const [updated] = await useDb()
    .update(libraryItems)
    .set(body)
    .where(eq(libraryItems.id, id))
    .returning()
  return toLibraryItem(updated!)
})
