import { beforeEach, describe, expect, it, vi } from 'vitest'
import { limitsFor } from '../../shared/utils/plans'
import { collectionItems, libraryItems, userBarcodes } from '../db/schema'

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
  insert: (table: unknown) => ({
    values: (values: unknown) => ({
      onConflictDoUpdate: () => ({ kind: 'upsert', table, values }),
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
    expect(result).toEqual({
      added: 40,
      withoutPlatform: 0,
      skipped: [],
      inCollection: 0,
    })
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

  it('adds a game without a platform when the catalog does not list the platform', async () => {
    const result = await bulkAdd('u1', free, {
      list: 'owned',
      entries: [{ igdbId: 1, platformId: 167 }],
    })
    expect(result).toMatchObject({ added: 1, withoutPlatform: 1 })
    const [upsert] = batches[0] as { values: { ownedOn: number[] }[] }[]
    expect(upsert!.values[0]!.ownedOn).toEqual([])
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

  describe('barcodes the user matched themselves', () => {
    const picks = () =>
      (
        batches[0] as { table: unknown; values: Record<string, unknown>[] }[]
      ).find((statement) => statement.table === userBarcodes)

    it('are saved in the same batch as the add, for that user', async () => {
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [
          {
            igdbId: 1,
            platformId: SWITCH,
            barcode: '0045496590048',
            own: true,
          },
          { igdbId: 2, platformId: SWITCH },
        ],
      })
      expect(batches).toHaveLength(1)
      expect(picks()?.values).toEqual([
        {
          ownerId: 'u1',
          code: '0045496590048',
          igdbId: 1,
          platformId: SWITCH,
        },
      ])
    })

    it('never keep a plain ScanDex match, even with its barcode sent', async () => {
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [{ igdbId: 1, platformId: SWITCH, barcode: '0045496590048' }],
      })
      expect(picks()).toBeUndefined()
    })

    it('are not saved for a game IGDB does not know, or a bad barcode', async () => {
      ensureCatalogGames.mockImplementation(async (ids: number[]) =>
        ids.filter((id) => id !== 9).map(game),
      )
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [
          { igdbId: 9, platformId: null, barcode: '0045496590048', own: true },
          { igdbId: 1, platformId: null, barcode: '123', own: true },
          { igdbId: 2, platformId: null },
        ],
      })
      expect(picks()).toBeUndefined()
    })

    it('are saved for a game already in the library, and drop an unlisted platform', async () => {
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
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [
          {
            igdbId: 1,
            platformId: SWITCH,
            barcode: '0045496590048',
            own: true,
          },
          { igdbId: 2, platformId: 999, barcode: '0045496590055', own: true },
        ],
      })
      expect(picks()?.values).toEqual([
        { ownerId: 'u1', code: '0045496590048', igdbId: 1, platformId: SWITCH },
        { ownerId: 'u1', code: '0045496590055', igdbId: 2, platformId: null },
      ])
    })

    it('are not saved when the add is refused', async () => {
      fake.libraryCount = free.games
      await expect(
        bulkAdd('u1', free, {
          list: 'owned',
          entries: [
            {
              igdbId: 1,
              platformId: SWITCH,
              barcode: '0045496590048',
              own: true,
            },
          ],
        }),
      ).rejects.toMatchObject({ statusCode: 403 })
      expect(batches).toEqual([])
    })
  })
})
