import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FieldDefinition } from '../../shared/types/collection'

// Each select answers by the shape of what it picks, so the order the
// queries are sent in doesn't matter.
let counts: number[] = []
const pages: unknown[][] = []
const asked: { offset?: number; limit?: number; orderBy?: unknown[] }[] = []
let countCalls = 0

function builder(fields: Record<string, unknown>) {
  const call: (typeof asked)[number] = {}
  const self: Record<string, unknown> = {
    from: () => self,
    leftJoin: () => self,
    innerJoin: () => self,
    where: () => self,
    orderBy: (...order: unknown[]) => {
      call.orderBy = order
      return self
    },
    limit: (limit: number) => {
      call.limit = limit
      return self
    },
    offset: (offset: number) => {
      call.offset = offset
      return self
    },
    then: (resolve: (rows: unknown) => unknown) => {
      if ('value' in fields) {
        return resolve([{ value: counts[countCalls++] ?? 0 }])
      }
      if ('item' in fields) {
        asked.push(call)
        return resolve(pages.shift() ?? [])
      }
      // The genres the list has: a select of a name alone.
      if (!('id' in fields))
        return resolve([{ name: 'Puzzle' }, { name: 'Adventure' }])
      return resolve([{ id: 19, name: 'SNES' }])
    },
  }
  return self
}

vi.mock('./db', () => ({
  useDb: () => ({
    select: (fields: Record<string, unknown>) => builder(fields),
    selectDistinct: (fields: Record<string, unknown>) => builder(fields),
  }),
}))
vi.mock('./collections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./collections')>()),
  customCollectionsOf: async () => new Map(),
  platformNames: async () => new Map([[19, 'SNES']]),
}))

const { assertCanViewList, getListPage, listVisibility } =
  await import('./lists')
const { parseListQuery } = await import('./list-query')

const owner = {
  id: '00000000-0000-4000-8000-000000000001',
  listColumns: {},
  ownedPublic: false,
  wishlistPublic: false,
}
const row = (n: number) => ({
  item: {
    id: `30000000-0000-4000-8000-00000000000${n}`,
    igdbId: null,
    name: `Game ${n}`,
    coverId: null,
    data: {},
    owned: true,
    wishlisted: false,
    ownedOn: [],
    wantedOn: [],
    createdAt: new Date(0),
  },
  game: null,
})

beforeEach(() => {
  counts = []
  pages.length = 0
  asked.length = 0
  countCalls = 0
})

describe('getListPage', () => {
  it('returns one page with the counts, and counts the list once when unfiltered', async () => {
    // The last count is the whole library, owned and wishlisted.
    counts = [120, 500]
    pages.push([row(1), row(2)])
    const result = await getListPage(
      owner,
      'owned',
      parseListQuery({ page: '2', size: '25' }, [], true),
      [],
    )
    expect(countCalls).toBe(2)
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ limit: 25, offset: 25 })
    expect(result).toMatchObject({
      list: 'owned',
      itemCount: 120,
      libraryCount: 500,
      total: 120,
      page: 2,
      size: 25,
      platforms: [{ id: 19, name: 'SNES' }],
      genres: ['Adventure', 'Puzzle'],
    })
    expect(result.items.map((item) => item.name)).toEqual(['Game 1', 'Game 2'])
  })

  it('counts the whole list separately once a search narrows it', async () => {
    counts = [3, 120, 500]
    pages.push([row(1)])
    const result = await getListPage(
      owner,
      'owned',
      parseListQuery({ q: 'zelda' }, [], true),
      [],
    )
    expect(countCalls).toBe(3)
    expect(result).toMatchObject({ total: 3, itemCount: 120, page: 1 })
  })

  it('gives the last page when the one asked for is past the end', async () => {
    counts = [60, 60]
    pages.push([], [row(1)])
    const result = await getListPage(
      owner,
      'wishlist',
      parseListQuery({ page: '9', size: '50' }, [], true),
      [],
    )
    expect(asked.map((call) => call.offset)).toEqual([400, 50])
    expect(result.page).toBe(2)
    expect(result.items).toHaveLength(1)
  })

  it('answers page 1 with no rows for an empty list', async () => {
    counts = [0]
    pages.push([])
    const result = await getListPage(
      owner,
      'owned',
      parseListQuery({ page: '4' }, [], true),
      [],
    )
    expect(result).toMatchObject({ page: 1, total: 0, itemCount: 0, items: [] })
  })

  it('gives each game its release date, genres and the catalog platforms it can pick from', async () => {
    counts = [1, 1]
    pages.push([
      {
        ...row(1),
        item: { ...row(1).item, igdbId: 1026 },
        game: {
          igdbId: 1026,
          name: 'A Link to the Past',
          coverId: null,
          releaseDate: '1991-11-21',
          releasePrecision: 'month',
          genres: ['Adventure'],
          platformIds: [19, 5],
          fetchedAt: new Date(0),
        },
      },
    ])
    const result = await getListPage(
      owner,
      'owned',
      parseListQuery({}, [], true),
      [],
    )
    // Platform 5 has no name in the platforms table, so it can't be shown.
    expect(result.items[0]).toMatchObject({
      releaseDate: '1991-11-21',
      releasePrecision: 'month',
      genres: ['Adventure'],
      catalogPlatforms: [{ id: 19, name: 'SNES' }],
    })
  })
})

describe('getListPage for a visitor', () => {
  const visitorOf = (raw: Record<string, unknown> = {}) =>
    parseListQuery(raw, [], false)
  const both = () => ({
    ...row(1),
    item: {
      ...row(1).item,
      igdbId: 1026,
      wishlisted: true,
      ownedOn: [19],
      wantedOn: [130],
    },
    game: {
      igdbId: 1026,
      name: 'A Link to the Past',
      coverId: null,
      releaseDate: '1991-11-21',
      releasePrecision: 'day',
      genres: ['Adventure'],
      platformIds: [19, 130],
      fetchedAt: new Date(0),
    },
  })

  it("shows Owned only the owned platforms, and nothing of the owner's collections or library", async () => {
    counts = [1]
    pages.push([both()])
    const result = await getListPage(
      { ...owner, ownedPublic: true },
      'owned',
      visitorOf(),
      [],
    )
    expect(result).toMatchObject({
      list: 'owned',
      visibility: 'public',
      isOwner: false,
      itemCount: 1,
    })
    // The library count is the owner's, so it isn't even asked for.
    expect(result).not.toHaveProperty('libraryCount')
    expect(countCalls).toBe(1)
    const [entry] = result.items
    expect(entry).toMatchObject({ ownedOn: [19], wantedOn: [], wanted: false })
    expect(entry!.catalogPlatforms).toEqual([{ id: 19, name: 'SNES' }])
    for (const key of ['owned', 'wishlisted', 'inCollections']) {
      expect(entry).not.toHaveProperty(key)
    }
  })

  it('shows the Wishlist only the wanted platforms', async () => {
    counts = [1]
    pages.push([both()])
    const result = await getListPage(
      { ...owner, wishlistPublic: true },
      'wishlist',
      visitorOf(),
      [],
    )
    expect(result.visibility).toBe('public')
    expect(result.items[0]).toMatchObject({
      ownedOn: [],
      wantedOn: [130],
      wanted: true,
    })
  })

  it('gives only the values of the fields the visitor may see', async () => {
    counts = [1]
    const shown: FieldDefinition = { id: 'a', name: 'Notes', type: 'text' }
    pages.push([
      {
        ...row(1),
        item: { ...row(1).item, data: { a: 'hi', secret: 'x' } },
      },
    ])
    const result = await getListPage(owner, 'owned', visitorOf(), [shown])
    expect(result.fields).toEqual([shown])
    expect(result.items[0]!.data).toEqual({ a: 'hi' })
  })
})

describe('who can open a list', () => {
  const user = { ownedPublic: true, wishlistPublic: false }

  it('reads each list from its own setting', () => {
    expect(listVisibility(user, 'owned')).toBe('public')
    expect(listVisibility(user, 'wishlist')).toBe('private')
  })

  it('always lets the owner in, and a visitor only to a public list', () => {
    expect(() => assertCanViewList(user, 'wishlist', true)).not.toThrow()
    expect(() => assertCanViewList(user, 'owned', false)).not.toThrow()
  })

  it('answers a visitor of a private list with a 404, like a private collection', () => {
    expect(() => assertCanViewList(user, 'wishlist', false)).toThrow(
      expect.objectContaining({ statusCode: 404 }),
    )
  })
})
