import type { BlueprintSummary } from '../../../shared/types/collection'

/** The signed-in user's blueprints, with how many fields each has. */
export default defineEventHandler(
  async (event): Promise<BlueprintSummary[]> => {
    const { sub } = await requireAuth(event)
    const user = await findOrCreateUser(sub)
    return listBlueprints(user.id)
  },
)
