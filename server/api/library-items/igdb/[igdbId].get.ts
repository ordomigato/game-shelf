import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { LibraryItem } from '../../../../shared/types/collection'
import { libraryItems } from '../../../db/schema'

const paramsSchema = z.object({ igdbId: z.coerce.number().int().positive() })

/**
 * Whether the user already tracks an IGDB game, and in which collections.
 * Used by the "Add to collection" picker.
 */
export default defineEventHandler(
  async (
    event,
  ): Promise<{ item: LibraryItem | null; collectionIds: string[] }> => {
    const { sub } = await requireAuth(event)
    const { igdbId } = await getValidatedRouterParams(event, paramsSchema.parse)
    const user = await findOrCreateUser(sub)
    const [item] = await useDb()
      .select()
      .from(libraryItems)
      .where(
        and(eq(libraryItems.ownerId, user.id), eq(libraryItems.igdbId, igdbId)),
      )
    if (!item) return { item: null, collectionIds: [] }
    return {
      item: toLibraryItem(item),
      collectionIds: await collectionIdsForItem(item.id),
    }
  },
)
