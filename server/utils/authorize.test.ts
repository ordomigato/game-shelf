import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const COLLECTION = '10000000-0000-4000-8000-000000000001'
const MISSING = '10000000-0000-4000-8000-0000000000ff'

let token: { sub: string; username: string } | null
let user: { id: string; roles: string[] } | undefined
let creations = 0
/** What a lookup of collections or items finds. */
let found: { ownerId: string; visibility?: string }[]

vi.mock('./auth', () => ({
  requireAuth: async () => {
    if (!token) throw { statusCode: 401, statusMessage: 'Sign in required' }
    return token
  },
  optionalAuth: async () => token,
}))
vi.mock('./users', () => ({
  findOrCreateUser: async () => {
    creations++
    return user
  },
  findUserBySub: async () => user,
}))
vi.stubGlobal('useDb', () => ({
  select: () => ({
    from: () => ({
      where: async () => found,
    }),
  }),
}))

const {
  assertCanOnCollections,
  authorize,
  authorizeAccount,
  collectionOf,
  collectionResource,
  itemOf,
  viewerOf,
} = await import('./authorize')

const event = (params: Record<string, string> = {}) =>
  ({ context: { params } }) as never

beforeEach(() => {
  token = { sub: 'sub-1', username: 'sub-1' }
  user = { id: OWNER, roles: [] }
  found = [{ ownerId: OWNER, visibility: 'private' }]
  creations = 0
})

describe('authorize', () => {
  it('is a 401 without a signed-in user, before the resource is loaded', async () => {
    token = null
    const load = vi.fn(async () => ({ ownerId: OWNER }))
    await expect(
      authorize(event(), 'collection.update', load),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(load).not.toHaveBeenCalled()
  })

  it('gives the user, their subject and the token claims', async () => {
    const result = await authorize(event(), 'account.read')
    expect(result.user).toBe(user)
    expect(result.subject).toEqual({ id: OWNER, roles: [] })
    expect(result.claims).toBe(token)
  })

  it('lets a signed-in user act on their own data without a resource', async () => {
    for (const action of [
      'library.write',
      'export.read',
      'collection.create',
    ]) {
      await expect(authorize(event(), action as never)).resolves.toBeTruthy()
    }
  })

  it("is a 404 for someone else's resource, whatever the action", async () => {
    for (const action of [
      'collection.update',
      'collection.delete',
      'library.write',
    ] as const) {
      await expect(
        authorize(event(), action, { ownerId: OTHER, visibility: 'public' }),
      ).rejects.toMatchObject({ statusCode: 404 })
    }
  })

  it('lets the owner act on a loaded resource', async () => {
    const result = await authorize(event(), 'collection.update', async () => ({
      ownerId: OWNER,
    }))
    expect(result.subject.id).toBe(OWNER)
  })

  it('is a 404 for an action that needs a role the user lacks, and a pass with it', async () => {
    await expect(authorize(event(), 'barcodes.review')).rejects.toMatchObject({
      statusCode: 404,
    })
    user = { id: OWNER, roles: ['admin'] }
    await expect(authorize(event(), 'barcodes.review')).resolves.toBeTruthy()
  })

  it("keeps an admin out of other people's data", async () => {
    user = { id: OWNER, roles: ['admin'] }
    await expect(
      authorize(event(), 'collection.update', { ownerId: OTHER }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('authorizeAccount', () => {
  it('is a 401 without a signed-in user', async () => {
    token = null
    await expect(
      authorizeAccount(event(), 'account.delete'),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('lets a signed-in user with a row through, without creating one', async () => {
    const result = await authorizeAccount(event(), 'account.delete')
    expect(result.subject).toEqual({ id: OWNER, roles: [] })
    expect(result.claims).toBe(token)
    expect(creations).toBe(0)
  })

  it('lets a signed-in user with no row through, and still creates none', async () => {
    user = undefined
    const result = await authorizeAccount(event(), 'account.delete')
    expect(result.claims.sub).toBe('sub-1')
    expect(creations).toBe(0)
  })

  it('still refuses an action the policy does not allow', async () => {
    await expect(
      authorizeAccount(event(), 'barcodes.review'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('viewerOf', () => {
  it('is null for a visitor', async () => {
    token = null
    expect(await viewerOf(event())).toBeNull()
  })

  it('is the signed-in user as a subject', async () => {
    user = { id: OWNER, roles: ['admin'] }
    expect(await viewerOf(event())).toEqual({ id: OWNER, roles: ['admin'] })
  })

  it('is a visitor when the token has no user row yet', async () => {
    user = undefined
    expect(await viewerOf(event())).toBeNull()
  })
})

describe('loading a resource', () => {
  it('finds a collection by id, with its owner and visibility', async () => {
    expect(await collectionResource(COLLECTION)).toEqual({
      ownerId: OWNER,
      visibility: 'private',
    })
  })

  it('is a 404 for a collection or item that does not exist', async () => {
    found = []
    await expect(collectionResource(MISSING)).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect(
      authorize(event({ id: MISSING }), 'collection.update', async () =>
        collectionResource(MISSING),
      ),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('reads the id from the route and refuses one that is not a uuid', async () => {
    expect(await collectionOf(event({ id: COLLECTION }))()).toMatchObject({
      ownerId: OWNER,
    })
    expect(
      await itemOf(event({ itemId: COLLECTION }), 'itemId')(),
    ).toMatchObject({ ownerId: OWNER })
    await expect(collectionOf(event({ id: 'nope' }))()).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('checks every collection a request names', async () => {
    await expect(
      assertCanOnCollections({ id: OWNER, roles: [] }, 'collection.update', [
        COLLECTION,
      ]),
    ).resolves.toBeUndefined()
    await expect(
      assertCanOnCollections({ id: OTHER, roles: [] }, 'collection.update', [
        COLLECTION,
      ]),
    ).rejects.toMatchObject({ statusCode: 404 })
    await expect(
      assertCanOnCollections({ id: OWNER, roles: [] }, 'collection.update', [
        COLLECTION,
        MISSING,
      ]),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
