import { beforeEach, describe, expect, it, vi } from 'vitest'
import { limitsFor } from '../../shared/utils/plans'
import { PgDialect } from 'drizzle-orm/pg-core'
import { MAX_PENDING_PICKS } from '../../shared/utils/barcode'
import { barcodeLookups, collectionItems, libraryItems } from '../db/schema'

const ensureCatalogGames = vi.fn()
const submitToScanDex = vi.fn()
vi.mock('./scandex', () => ({ submitToScanDex }))
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
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
  /** The user's picks for the codes in the batch, as the table holds them. */
  stored: {
    code: string
    igdbId: number
    platformId: number | null
    status: 'pending' | 'approved' | 'rejected'
  }[]
  /** How many pending picks the user has in all. */
  pending: number
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
        if (table === barcodeLookups) {
          return fields?.n ? [{ n: fake.pending }] : fake.stored
        }
        return []
      },
    }),
  }),
  insert: (table: unknown) => ({
    values: (values: unknown) => ({
      onConflictDoUpdate: (config: unknown) => ({
        kind: 'upsert',
        table,
        values,
        config,
      }),
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
  fake = {
    existing: [],
    libraryCount: 0,
    inCollection: [],
    collectionCount: 0,
    stored: [],
    pending: 0,
  }
  batches.length = 0
  reads.length = 0
  submitToScanDex.mockReset()
  fetchMock.mockReset()
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
      ).find((statement) => statement.table === barcodeLookups)

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
          code: '0045496590048',
          igdbId: 1,
          platformId: SWITCH,
          source: 'user',
          submittedBy: 'u1',
          status: 'pending',
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
        expect.objectContaining({ code: '0045496590048', platformId: SWITCH }),
        expect.objectContaining({ code: '0045496590055', platformId: null }),
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

  describe('remembering barcodes', () => {
    type Statement = {
      table: unknown
      values: Record<string, unknown>[]
      config: { target: unknown[] }
    }
    const pickStatement = () =>
      (batches[0] as Statement[] | undefined)?.find(
        (statement) => statement.table === barcodeLookups,
      )
    const code = '0045496590048'

    it('upserts on (code, submitted_by) for user rows, so one user never overwrites another', async () => {
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [{ igdbId: 1, platformId: SWITCH, barcode: code, own: true }],
      })
      expect(pickStatement()?.config.target).toEqual([
        barcodeLookups.code,
        barcodeLookups.submittedBy,
      ])
      expect(pickStatement()?.values).toEqual([
        expect.objectContaining({ submittedBy: 'u1', code }),
      ])
      // The same barcode from another user is a row of their own.
      batches.length = 0
      await bulkAdd('u2', free, {
        list: 'owned',
        entries: [{ igdbId: 2, platformId: SWITCH, barcode: code, own: true }],
      })
      expect(pickStatement()?.values).toEqual([
        expect.objectContaining({ submittedBy: 'u2', code, igdbId: 2 }),
      ])
    })

    it('saves every pick as pending, never approved, and never as a ScanDex row', async () => {
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [{ igdbId: 1, platformId: SWITCH, barcode: code, own: true }],
      })
      expect(pickStatement()?.values).toEqual([
        expect.objectContaining({ source: 'user', status: 'pending' }),
      ])
      const { set } = pickStatement()!.config as unknown as {
        set: Record<string, unknown>
      }
      expect(set).toMatchObject({
        status: 'pending',
        reviewedAt: null,
        sentAt: null,
      })
    })

    it('changes a row only when the game or platform differs, whatever its status', async () => {
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [{ igdbId: 1, platformId: SWITCH, barcode: code, own: true }],
      })
      const { setWhere, targetWhere } = pickStatement()!.config as unknown as {
        setWhere: never
        targetWhere: never
      }
      const where = new PgDialect().sqlToQuery(setWhere).sql
      // Not by status: an approved row moves back to pending too.
      expect(where).not.toContain('status')
      expect(where).toContain('is distinct from (excluded.igdb_id')
      expect(new PgDialect().sqlToQuery(targetWhere).sql).toContain(
        `"barcode_lookups"."source" = 'user'`,
      )
    })

    it('moves the user’s own approved pick back to pending when it names another game', async () => {
      fake.stored = [
        { code, igdbId: 5, platformId: SWITCH, status: 'approved' },
      ]
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [{ igdbId: 1, platformId: SWITCH, barcode: code, own: true }],
      })
      expect(pickStatement()?.values).toEqual([
        expect.objectContaining({
          code,
          igdbId: 1,
          submittedBy: 'u1',
          status: 'pending',
        }),
      ])
      const { set } = pickStatement()!.config as unknown as {
        set: Record<string, unknown>
      }
      expect(set).toMatchObject({
        status: 'pending',
        reviewedAt: null,
        sentAt: null,
      })
      // Only the user's own row is the target. Other users' rows for the
      // approved game are other rows and stay approved.
      expect(pickStatement()?.config.target).toEqual([
        barcodeLookups.code,
        barcodeLookups.submittedBy,
      ])
    })

    it('leaves an approved pick alone when it names the same game and platform', async () => {
      fake.stored = [
        { code, igdbId: 1, platformId: SWITCH, status: 'approved' },
      ]
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [{ igdbId: 1, platformId: SWITCH, barcode: code, own: true }],
      })
      expect(pickStatement()).toBeUndefined()
    })

    it('counts a re-pick of an approved pick toward the pending cap', async () => {
      fake.pending = MAX_PENDING_PICKS
      fake.stored = [
        { code, igdbId: 5, platformId: SWITCH, status: 'approved' },
      ]
      const result = await bulkAdd('u1', free, {
        list: 'owned',
        entries: [{ igdbId: 1, platformId: SWITCH, barcode: code, own: true }],
      })
      expect(result.added).toBe(1)
      expect(pickStatement()).toBeUndefined()
      fake.pending = MAX_PENDING_PICKS - 1
      batches.length = 0
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [{ igdbId: 1, platformId: SWITCH, barcode: code, own: true }],
      })
      expect(pickStatement()?.values).toHaveLength(1)
    })

    it('does not save a rejected pick again for the same game and platform', async () => {
      fake.stored = [
        { code, igdbId: 1, platformId: SWITCH, status: 'rejected' },
      ]
      const result = await bulkAdd('u1', free, {
        list: 'owned',
        entries: [{ igdbId: 1, platformId: SWITCH, barcode: code, own: true }],
      })
      expect(result.added).toBe(1)
      expect(pickStatement()).toBeUndefined()
    })

    it('saves a rejected pick again when it now names another game', async () => {
      fake.stored = [
        { code, igdbId: 5, platformId: SWITCH, status: 'rejected' },
      ]
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [{ igdbId: 1, platformId: SWITCH, barcode: code, own: true }],
      })
      expect(pickStatement()?.values).toEqual([
        expect.objectContaining({ code, igdbId: 1, status: 'pending' }),
      ])
    })

    it('saves a remember-only barcode for a game already in the library, without adding it', async () => {
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
      const result = await bulkAdd('u1', free, {
        list: 'wishlist',
        entries: [
          {
            igdbId: 1,
            platformId: SWITCH,
            barcode: code,
            own: true,
            rememberOnly: true,
          },
        ],
      })
      expect(result).toEqual({
        added: 0,
        withoutPlatform: 0,
        skipped: [],
        inCollection: 0,
      })
      expect(batches[0]).toHaveLength(1)
      expect(pickStatement()?.values).toEqual([
        expect.objectContaining({ code, igdbId: 1 }),
      ])
    })

    it('does not save a remember-only barcode for a game that is not in the library', async () => {
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [
          { igdbId: 2, platformId: null },
          {
            igdbId: 1,
            platformId: SWITCH,
            barcode: code,
            own: true,
            rememberOnly: true,
          },
        ],
      })
      expect(pickStatement()).toBeUndefined()
    })

    it('reads only the added games and library games from IGDB, never a remember-only stranger', async () => {
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
          { igdbId: 2, platformId: null },
          {
            igdbId: 1,
            platformId: SWITCH,
            barcode: code,
            own: true,
            rememberOnly: true,
          },
          {
            igdbId: 999,
            platformId: SWITCH,
            barcode: '0045496590055',
            own: true,
            rememberOnly: true,
          },
        ],
      })
      expect(ensureCatalogGames).toHaveBeenCalledOnce()
      expect(ensureCatalogGames.mock.calls[0]![0].sort()).toEqual([1, 2])
    })

    it('stops saving picks at 200 pending, but still adds the games', async () => {
      fake.pending = MAX_PENDING_PICKS
      const result = await bulkAdd('u1', free, {
        list: 'owned',
        entries: [{ igdbId: 1, platformId: SWITCH, barcode: code, own: true }],
      })
      expect(result.added).toBe(1)
      expect(pickStatement()).toBeUndefined()
    })

    it('saves only as many new picks as the cap has room for, but changes to pending picks take none', async () => {
      fake.pending = MAX_PENDING_PICKS - 1
      fake.stored = [
        {
          code: '0045496590055',
          igdbId: 9,
          platformId: SWITCH,
          status: 'pending',
        },
      ]
      const result = await bulkAdd('u1', free, {
        list: 'owned',
        entries: [
          { igdbId: 1, platformId: SWITCH, barcode: code, own: true },
          {
            igdbId: 2,
            platformId: SWITCH,
            barcode: '0045496590055',
            own: true,
          },
          {
            igdbId: 3,
            platformId: SWITCH,
            barcode: '0036000291452',
            own: true,
          },
        ],
      })
      expect(result.added).toBe(3)
      // One slot is left: the first new pick takes it, the change is free.
      expect(pickStatement()?.values.map((v) => v.code)).toEqual([
        code,
        '0045496590055',
      ])
    })
  })

  describe('sending to ScanDex', () => {
    it('never calls ScanDex, even with a pick ScanDex did not know', async () => {
      await bulkAdd('u1', free, {
        list: 'owned',
        entries: [
          {
            igdbId: 1,
            platformId: SWITCH,
            barcode: '0045496590048',
            own: true,
          },
        ],
      })
      // The pick is saved as always, and nothing is sent.
      const saved = (
        batches[0] as { table: unknown; values: { code: string }[] }[]
      ).find((statement) => statement.table === barcodeLookups)
      expect(saved?.values.map((v) => v.code)).toEqual(['0045496590048'])
      expect(submitToScanDex).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
