import { z } from 'zod'
import { seesAllOf } from '../../../../../shared/utils/access'
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
  const [owner, viewer] = await Promise.all([
    findUserByUsername(username),
    viewerOf(event),
  ])
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  assertCan(viewer, 'list.read', listResource(owner, list))
  const viewerIsOwner = seesAllOf(viewer, owner.id)
  const allFields = await getUserFields(owner.id)
  const fields = viewerIsOwner
    ? allFields
    : await visitorFieldsOfList(owner.id, list, allFields, viewer)
  const query = parseListQuery(getQuery(event), fields, viewerIsOwner)
  return getListPage(owner, list, query, fields, viewer)
})
