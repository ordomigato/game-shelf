import { z } from 'zod'
import type { LibraryItem } from '../../../shared/types/collection'

const bodySchema = z.object({
  /** Set when adding from IGDB. Leave out for a game added by hand. */
  igdbId: z.number().int().positive().nullable().default(null),
  name: z.string().trim().min(1).max(200),
  coverId: z.string().trim().max(100).nullable().default(null),
  collectionIds: z.array(z.uuid()).max(50).default([]),
})

/**
 * Adds a game to the user's library (or finds it, for an IGDB game already
 * there) and puts it in the given collections.
 */
export default defineEventHandler(
  async (event): Promise<{ item: LibraryItem; collectionIds: string[] }> => {
    const { sub } = await requireAuth(event)
    const { collectionIds, ...game } = await readValidatedBody(
      event,
      bodySchema.parse,
    )
    const user = await findOrCreateUser(sub)
    const item = await findOrCreateItem(user.id, game)
    await addItemToCollections(user.id, item.id, collectionIds)
    return {
      item: toLibraryItem(item),
      collectionIds: await collectionIdsForItem(item.id),
    }
  },
)
