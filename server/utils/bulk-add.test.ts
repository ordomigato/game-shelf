import { beforeEach, describe, expect, it, vi } from 'vitest'
import { limitsFor } from '../../shared/utils/plans'
import { collectionItems, libraryItems } from '../db/schema'

const ensureCatalogGames = vi.fn()
const assertOwnsCollections = vi.fn()
vi.mock('./catalog', () => ({ ensureCatalogGames }))
vi.mock('./collections', () => ({
  assertOwnsCollections,
  lastPositions: async () => new Map([['c1', 5]]),
}))

interface Fake {
  existing: Record<string, unknown>[]
  libraryCount: number
  inCollection: { itemId: string }[]
  collectionCount: number
}
let fake: Fake
const batches: unknown[][] = []
const reads: string[] = []

vi.stubGlobal('useDb', () => ({
  select: (fields?: Record<string, unknown>) => ({
    from: (table: unknown) => ({
      where: async () => {
        if (table === libraryItems) {
          reads.push(fields?.n ? 'library count' : 'library items')
          return fields?.n ? [{ n: fake.libraryCount }] : fake.existing
        }
        if (table === collectionItems) {
          reads.push(fields?.n ? 'collection count' : 'collection items')
          return fields?.n ? [{ n: fake.collectionCount }] : fake.inCollection
        }
        return []
      },
    }),
  }),
  insert: () => ({
    values: (values: unknown) => ({
      onConflictDoUpdate: () => ({ kind: 'upsert', values }),
    }),
  }),
  execute: () => ({ kind: 'collection insert' }),
  batch: async (statements: unknown[]) => {
    batches.push(statements)
    return []
  },
}))

const { bulkAdd } = await import('./bulk-add')

const SWITCH = 130
const free = limitsFor('free')
const game = (igdbId: number) => ({
  igdbId,
  name: `Game ${igdbId}`,
  coverId: null,
  platformIds: [SWITCH],
})

beforeEach(() => {
  fake = { existing: [], libraryCount: 0, inCollection: [], collectionCount: 0 }
  batches.length = 0
  reads.length = 0
  ensureCatalogGames.mockReset()
  ensureCatalogGames.mockImplementation(async (ids: number[]) => ids.map(game))
  assertOwnsCollections.mockReset()
})

const entries = (ids: number[]) =>
  ids.map((igdbId) => ({ igdbId, platformId: SWITCH }))

describe('bulkAdd', () => {
  it('writes all the games in one batch, reading them in a fixed number of queries', async () => {
    const result = await bulkAdd('u1', free, {
      list: 'owned',
      entries: entries(Array.from({ length: 40 }, (_, i) => i + 1)),
    })
    expect(result).toEqual({ added: 40, skipped: [], inCollection: 0 })
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(1)
    expect(ensureCatalogGames).toHaveBeenCalledOnce()
    // No per-game queries.
    expect(reads).toEqual(['library items', 'library count'])
    const [upsert] = batches[0] as { values: { igdbId: number }[] }[]
    expect(upsert!.values).toHaveLength(40)
  })

  it('adds the games to the collection in the same batch', async () => {
    const result = await bulkAdd('u1', free, {
      list: 'owned',
      collectionId: 'c1',
      entries: entries([1, 2, 3]),
    })
    expect(assertOwnsCollections).toHaveBeenCalledWith('u1', ['c1'])
    expect(result.inCollection).toBe(3)
    expect(batches[0]).toHaveLength(2)
    expect(batches[0]![1]).toEqual({ kind: 'collection insert' })
  })

  it('answers 404 for a collection that is not the user’s, and writes nothing', async () => {
    const notFound = Object.assign(new Error('Not found'), { statusCode: 404 })
    assertOwnsCollections.mockRejectedValue(notFound)
    await expect(
      bulkAdd('u1', free, {
        list: 'owned',
        collectionId: 'someone-elses',
        entries: entries([1]),
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(batches).toEqual([])
    expect(ensureCatalogGames).not.toHaveBeenCalled()
  })

  it('refuses everything when the library has no room for all the new games', async () => {
    fake.libraryCount = free.games - 2
    await expect(
      bulkAdd('u1', free, { list: 'owned', entries: entries([1, 2, 3]) }),
    ).rejects.toMatchObject({
      statusCode: 403,
      data: { key: 'limits.reached.bulkLibrary', params: { fit: 2 } },
    })
    expect(batches).toEqual([])
  })

  it('does not count games already in the library against its limit', async () => {
    fake.libraryCount = free.games
    fake.existing = [
      {
        id: 'i1',
        igdbId: 1,
        owned: false,
        wishlisted: true,
        ownedOn: [],
        wantedOn: [SWITCH],
      },
    ]
    const result = await bulkAdd('u1', free, {
      list: 'owned',
      entries: entries([1]),
    })
    expect(result.added).toBe(1)
    expect(batches).toHaveLength(1)
  })

  it('refuses everything when the collection has no room for all, saying how many fit', async () => {
    fake.collectionCount = free.gamesPerCollection - 1
    await expect(
      bulkAdd('u1', free, {
        list: 'owned',
        collectionId: 'c1',
        entries: entries([1, 2]),
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      data: { key: 'limits.reached.bulkCollection', params: { fit: 1 } },
    })
    expect(batches).toEqual([])
  })

  it('lets games already in the collection through when it is full', async () => {
    fake.collectionCount = free.gamesPerCollection
    fake.existing = [
      {
        id: 'i1',
        igdbId: 1,
        owned: true,
        wishlisted: false,
        ownedOn: [SWITCH],
        wantedOn: [],
      },
    ]
    fake.inCollection = [{ itemId: 'i1' }]
    const result = await bulkAdd('u1', free, {
      list: 'owned',
      collectionId: 'c1',
      entries: entries([1]),
    })
    expect(result.inCollection).toBe(0)
    expect(result.skipped).toEqual([{ igdbId: 1, reason: 'already' }])
    expect(batches).toEqual([])
  })

  it('reports games IGDB does not know without failing the rest', async () => {
    ensureCatalogGames.mockResolvedValue([game(1)])
    const result = await bulkAdd('u1', free, {
      list: 'wishlist',
      entries: entries([1, 2]),
    })
    expect(result.added).toBe(1)
    expect(result.skipped).toEqual([{ igdbId: 2, reason: 'notFound' }])
  })
})
