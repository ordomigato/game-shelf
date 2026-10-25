import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collections, libraryItems } from '../db/schema'

const ME = '00000000-0000-4000-8000-000000000001'
const THEM = '00000000-0000-4000-8000-000000000002'
const MINE = '10000000-0000-4000-8000-000000000001'
const FOREIGN = '10000000-0000-4000-8000-000000000002'
const ITEM = '20000000-0000-4000-8000-000000000001'
const FOREIGN_ITEM = '20000000-0000-4000-8000-000000000002'
const GONE = '30000000-0000-4000-8000-000000000000'

interface Row {
  ownerId: string
  visibility?: string
}
const mineC: Row = { ownerId: ME, visibility: 'private' }
// Public, so only ownership can keep a signed-in stranger out.
const foreignC: Row = { ownerId: THEM, visibility: 'public' }
const mineI: Row = { ownerId: ME }
const foreignI: Row = { ownerId: THEM }

/** What each owner lookup the request makes finds, in order. */
let answers: Row[][] = []
const writes: string[] = []

vi.mock('../utils/auth', () => ({
  requireAuth: async () => ({ sub: 'sub-1', username: 'sub-1' }),
  optionalAuth: async () => null,
}))
vi.mock('../utils/users', () => ({
  findOrCreateUser: async () => ({ id: ME, roles: ['user'], fields: [] }),
  findUserBySub: async () => ({ id: ME, roles: ['user'] }),
}))

// A lookup answers with the next prepared rows. Any write is recorded, and
// every test expects there to be none.
vi.stubGlobal('useDb', () => ({
  select: () => ({
    from: (table: unknown) => ({
      where: async () =>
        table === collections || table === libraryItems
          ? (answers.shift() ?? [])
          : [],
    }),
  }),
  insert: () => writes.push('insert'),
  update: () => writes.push('update'),
  delete: () => writes.push('delete'),
  execute: () => writes.push('execute'),
  batch: () => writes.push('batch'),
}))

let params: Record<string, string>
let body: unknown
let query: unknown

const parser =
  (read: () => unknown) =>
  async (_event: unknown, parse: (value: unknown) => unknown) =>
    parse(read())
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', createError)
vi.stubGlobal('setResponseStatus', () => undefined)
vi.stubGlobal(
  'getValidatedRouterParams',
  parser(() => params),
)
vi.stubGlobal(
  'readValidatedBody',
  parser(() => body),
)
vi.stubGlobal(
  'getValidatedQuery',
  parser(() => query),
)

// The policy and the loaders are the real ones.
const authorizeModule = await import('../utils/authorize')
const { assertCan } = await import('../utils/assert-can')
for (const [name, value] of Object.entries({ ...authorizeModule, assertCan })) {
  vi.stubGlobal(name, value)
}

// Anything that would change data, or look further, must not be reached.
for (const name of [
  'bulkAdd',
  'setItemCollections',
  'findOrCreateItem',
  'addItemToCollections',
  'assertRoomToAdd',
  'assertLibraryRoom',
  'updateCollection',
  'deleteCollection',
  'updateDashboard',
  'removeItemFromCollection',
  'moveItemInCollection',
  'updateItemValues',
  'getOwnedCollection',
  'getOwnedItem',
]) {
  vi.stubGlobal(name, () => {
    writes.push(name)
    return Promise.resolve()
  })
}
vi.stubGlobal('userLimits', () => ({}))
vi.stubGlobal('collectionTitleProblem', () => null)

type Handler = (event: unknown) => Promise<unknown>

interface Case {
  name: string
  route: () => Promise<{ default: unknown }>
  params?: Record<string, string>
  body?: unknown
  query?: unknown
  /** What each of the route's owner lookups finds, in order. */
  finds: Row[][]
}

const cases: Case[] = [
  {
    name: 'library-items POST with a foreign collection in collectionIds',
    route: () => import('./library-items/index.post'),
    body: { name: 'Game', collectionIds: [FOREIGN] },
    finds: [[foreignC]],
  },
  {
    name: 'library-items POST with a collection that does not exist',
    route: () => import('./library-items/index.post'),
    body: { name: 'Game', collectionIds: [GONE] },
    finds: [[]],
  },
  {
    name: 'library-items bulk POST with a foreign collectionId',
    route: () => import('./library-items/bulk.post'),
    body: { list: 'owned', collectionId: FOREIGN, items: [{ igdbId: 1 }] },
    finds: [[foreignC]],
  },
  {
    name: "an item's collections PUT with a foreign id in add",
    route: () => import('./library-items/[id]/collections.put'),
    params: { id: ITEM },
    body: { add: [FOREIGN], remove: [] },
    finds: [[mineI], [foreignC]],
  },
  {
    name: "an item's collections PUT with a foreign id in remove",
    route: () => import('./library-items/[id]/collections.put'),
    params: { id: ITEM },
    body: { add: [], remove: [FOREIGN] },
    finds: [[mineI], [foreignC]],
  },
  {
    name: "a foreign item's collections PUT",
    route: () => import('./library-items/[id]/collections.put'),
    params: { id: FOREIGN_ITEM },
    body: { add: [MINE], remove: [] },
    finds: [[foreignI]],
  },
  {
    name: 'tracked items GET with a foreign collection',
    route: () => import('./library-items/igdb/index.get'),
    query: { ids: '1,2', collection: FOREIGN },
    finds: [[foreignC]],
  },
  {
    name: 'collection PATCH on a foreign collection',
    route: () => import('./collections/[id]/index.patch'),
    params: { id: FOREIGN },
    body: { title: 'Mine now' },
    finds: [[foreignC]],
  },
  {
    name: 'collection DELETE on a foreign collection',
    route: () => import('./collections/[id]/index.delete'),
    params: { id: FOREIGN },
    finds: [[foreignC]],
  },
  {
    name: 'collection DELETE on one that does not exist',
    route: () => import('./collections/[id]/index.delete'),
    params: { id: GONE },
    finds: [[]],
  },
  {
    name: 'removing an item from a foreign collection',
    route: () => import('./collections/[id]/items/[itemId].delete'),
    params: { id: FOREIGN, itemId: ITEM },
    finds: [[foreignC]],
  },
  {
    name: "removing a foreign item from one's own collection",
    route: () => import('./collections/[id]/items/[itemId].delete'),
    params: { id: MINE, itemId: FOREIGN_ITEM },
    finds: [[mineC], [foreignI]],
  },
  {
    name: "editing a foreign item's values in one's own collection",
    route: () => import('./collections/[id]/items/[itemId].patch'),
    params: { id: MINE, itemId: FOREIGN_ITEM },
    body: { values: {} },
    finds: [[mineC], [foreignI]],
  },
]

const run = async (route: Case['route']) => {
  const handler = (await route()).default as Handler
  return handler({ context: { params } })
}

beforeEach(() => {
  writes.length = 0
})

describe('ids that belong to someone else, or to nobody', () => {
  for (const c of cases) {
    it(`${c.name}: 404 and nothing written`, async () => {
      params = c.params ?? {}
      body = c.body
      query = c.query
      answers = c.finds.map((rows) => [...rows])
      await expect(run(c.route)).rejects.toMatchObject({ statusCode: 404 })
      expect(writes).toEqual([])
      expect(answers).toEqual([])
    })
  }

  it("lets the owner's own collection past the policy, so the 404s above are the policy's", async () => {
    params = { id: MINE }
    body = { title: 'Renamed' }
    answers = [[mineC]]
    await run(() => import('./collections/[id]/index.patch')).catch(
      () => undefined,
    )
    expect(writes).toContain('updateCollection')
  })
})
