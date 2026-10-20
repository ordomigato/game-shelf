import { z } from 'zod'
import type { LibraryItem } from '../../../shared/types/collection'
import {
  applyListAction,
  newListState,
  type ListAction,
} from '../../../shared/utils/lists'

const bodySchema = z
  .object({
    /** Set when adding from IGDB. Leave out for a game added by hand. */
    igdbId: z.number().int().positive().nullable().default(null),
    name: z.string().trim().min(1).max(200),
    coverId: z.string().trim().max(100).nullable().default(null),
    collectionIds: z.array(z.uuid()).max(50).default([]),
    /** Which list a new game goes on. Owned when left out. */
    list: z.enum(['owned', 'wishlist']).optional(),
    /** The platforms for that list. IGDB games only. */
    platforms: z.array(z.number().int().positive()).max(50).default([]),
  })
  .refine((body) => body.platforms.length === 0 || (body.list && body.igdbId))

/**
 * Adds a game to the user's library (or finds it, for an IGDB game already
 * there) and puts it in the given collections. A new game is owned, or
 * wishlisted when `list` says so. With `list`, a game already in the
 * library is put on that list too. Without it, its lists are left alone.
 */
export default defineEventHandler(
  async (event): Promise<{ item: LibraryItem; collectionIds: string[] }> => {
    const { sub } = await requireAuth(event)
    const { collectionIds, list, platforms, ...game } = await readValidatedBody(
      event,
      bodySchema.parse,
    )
    const user = await findOrCreateUser(sub)
    const limits = userLimits(user)
    const existingId = await itemIdForIgdb(user.id, game.igdbId)
    await assertRoomToAdd(user.id, existingId, collectionIds, limits)
    // A game already in the library is checked when it joins a list.
    if (!existingId) {
      if (list === 'wishlist') await assertListRoom(user.id, list, 1, limits)
      else await assertOwnedRoom(user.id, 1, limits)
    }
    // The catalog gets the game from IGDB, never the name and cover sent.
    const [catalogGame] =
      game.igdbId !== null ? await ensureCatalogGames([game.igdbId]) : []
    if (!platforms.every((id) => catalogGame?.platformIds.includes(id))) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown platform' })
    }
    const item = await findOrCreateItem(
      user.id,
      game,
      newListState(list ?? 'owned', list ? platforms : []),
    )
    await addItemToCollections(user.id, item.id, collectionIds)
    let saved: LibraryItem | null = toLibraryItem(item, catalogGame ?? null)
    if (list && existingId) {
      const first: ListAction = { type: list === 'owned' ? 'own' : 'want' }
      const actions: ListAction[] = [first]
      if (platforms.length) {
        // Built on the state after the first action, which may have moved
        // platforms from the other list.
        const after = applyListAction(listStateOf(item), first)!
        const named = list === 'owned' ? after.ownedOn : after.wantedOn
        actions.push({
          type: list === 'owned' ? 'setOwnedOn' : 'setWantedOn',
          platforms: [...named, ...platforms],
        })
      }
      saved = await changeItemLists(user.id, item.id, actions, limits)
    }
    return {
      item: saved!,
      collectionIds: await collectionIdsForItem(item.id),
    }
  },
)
