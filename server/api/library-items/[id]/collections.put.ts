import { z } from 'zod'

const paramsSchema = z.object({ id: z.uuid() })
const idsSchema = z.array(z.uuid()).max(100)
const bodySchema = z
  .object({ add: idsSchema, remove: idsSchema })
  .refine((body) => body.add.length + body.remove.length > 0)
  .refine((body) => !body.add.some((id) => body.remove.includes(id)))

/**
 * Changes which of the user's collections a game is in: puts it in the ones
 * in `add` and takes it out of the ones in `remove`. Its other collections
 * and its lists stay as they are. Answers with every collection it's in.
 */
export default defineEventHandler(
  async (event): Promise<{ collectionIds: string[] }> => {
    const { sub } = await requireAuth(event)
    const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
    const change = await readValidatedBody(event, bodySchema.parse)
    const user = await findOrCreateUser(sub)
    return {
      collectionIds: await setItemCollections(
        user.id,
        id,
        change,
        userLimits(user),
      ),
    }
  },
)
