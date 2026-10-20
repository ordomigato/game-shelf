import { z } from 'zod'
import type { LibraryItem } from '../../../../shared/types/collection'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['gotIt', 'toWishlist', 'own', 'want', 'unown', 'unwant']),
  }),
  z.object({
    type: z.enum(['setOwnedOn', 'setWantedOn']),
    platforms: z.array(z.number().int().positive()).max(50),
  }),
])

/**
 * Changes a game's place on Owned and the Wishlist (see
 * `shared/utils/lists.ts`). The game keeps its collections and values. One
 * left on neither list is deleted, and `item` is null.
 */
export default defineEventHandler(
  async (
    event,
  ): Promise<{ item: LibraryItem | null; collectionIds: string[] }> => {
    const { sub } = await requireAuth(event)
    const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
    const action = await readValidatedBody(event, bodySchema.parse)
    const user = await findOrCreateUser(sub)
    const item = await changeItemLists(user.id, id, [action])
    return { item, collectionIds: item ? await collectionIdsForItem(id) : [] }
  },
)
