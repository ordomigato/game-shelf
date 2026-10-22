import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { LibraryItem } from '../../../../shared/types/collection'
import { games, libraryItems, platforms } from '../../../db/schema'

const paramsSchema = z.object({ igdbId: z.coerce.number().int().positive() })

/**
 * Whether the user already tracks an IGDB game, and in which collections,
 * plus the platforms the game is on, for the picker of which platform the
 * user owns or wants it on. The catalog reads the game from IGDB if it
 * hasn't. If IGDB can't be reached, the platforms are left empty.
 */
export default defineEventHandler(
  async (
    event,
  ): Promise<{
    item: LibraryItem | null
    collectionIds: string[]
    platforms: { id: number; name: string }[]
  }> => {
    const { user } = await authorize(event, 'library.read')
    const { igdbId } = await getValidatedRouterParams(event, paramsSchema.parse)
    const db = useDb()
    const [[found], [catalogGame]] = await Promise.all([
      db
        .select({ item: libraryItems, game: games })
        .from(libraryItems)
        .leftJoin(games, catalogJoin)
        .where(
          and(
            eq(libraryItems.ownerId, user.id),
            eq(libraryItems.igdbId, igdbId),
          ),
        ),
      ensureCatalogGames([igdbId]).catch(() => []),
    ])
    const platformIds = catalogGame?.platformIds ?? []
    const named = platformIds.length
      ? await db
          .select({
            id: platforms.igdbId,
            name: platforms.name,
            abbreviation: platforms.abbreviation,
          })
          .from(platforms)
          .where(inArray(platforms.igdbId, platformIds))
      : []
    const options = named
      .map((platform) => ({
        id: platform.id,
        name: platform.abbreviation ?? platform.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    if (!found) return { item: null, collectionIds: [], platforms: options }
    return {
      item: toLibraryItem(found.item, found.game),
      collectionIds: await collectionIdsForItem(found.item.id),
      platforms: options,
    }
  },
)
