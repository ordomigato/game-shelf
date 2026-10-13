import type { OwnedGame } from '../../shared/types/collection'

/** The signed-in user's owned games (see `ownedGames`). */
export default defineEventHandler(async (event): Promise<OwnedGame[]> => {
  const { sub } = await requireAuth(event)
  const user = await findOrCreateUser(sub)
  return ownedGames(user.id)
})
