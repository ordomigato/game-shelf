import { z } from 'zod'
import type { ListDetail } from '../../../../../shared/types/collection'

const paramsSchema = z.object({
  username: z.string().max(20),
  list: z.enum(['owned', 'wishlist']),
})

/**
 * One page of Owned or the Wishlist at `/u/<username>/shelf/<list>`, sorted,
 * searched and filtered by the query (see `parseListQuery`). The owner
 * always sees it. Anyone else sees it only when the owner made it public,
 * with the fields and platforms a visitor may see. Otherwise it's a 404,
 * like a private collection.
 */
export default defineEventHandler(async (event): Promise<ListDetail> => {
  const { username, list } = await getValidatedRouterParams(
    event,
    paramsSchema.parse,
  )
  const [owner, claims] = await Promise.all([
    findUserByUsername(username),
    optionalAuth(event),
  ])
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const viewerIsOwner = claims?.sub === owner.cognitoSub
  assertCanViewList(owner, list, viewerIsOwner)
  const allFields = await getUserFields(owner.id)
  const fields = viewerIsOwner
    ? allFields
    : await visitorFieldsOfList(owner.id, list, allFields)
  const query = parseListQuery(getQuery(event), fields, viewerIsOwner)
  return getListPage(owner, list, query, fields)
})
