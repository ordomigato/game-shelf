import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      return resolve([{ id: 19, name: 'SNES' }])
    },
  }
  return self
}

vi.mock('./db', () => ({
  useDb: () => ({
    select: (fields: Record<string, unknown>) => builder(fields),
  }),
}))
vi.mock('./collections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./collections')>()),
  customCollectionsOf: async () => new Map(),
}))
vi.mock('./limits', () => ({ assertListRoom: async () => {} }))

const { getListPage } = await import('./lists')
const { parseListQuery } = await import('./list-query')

const owner = '00000000-0000-4000-8000-000000000001'
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
    counts = [120]
    pages.push([row(1), row(2)])
    const result = await getListPage(
      owner,
      'owned',
      parseListQuery({ page: '2', size: '25' }, []),
      [],
    )
    expect(countCalls).toBe(1)
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ limit: 25, offset: 25 })
    expect(result).toMatchObject({
      list: 'owned',
      itemCount: 120,
      total: 120,
      page: 2,
      size: 25,
      platforms: [{ id: 19, name: 'SNES' }],
    })
    expect(result.items.map((item) => item.name)).toEqual(['Game 1', 'Game 2'])
  })

  it('counts the whole list separately once a search narrows it', async () => {
    counts = [3, 120]
    pages.push([row(1)])
    const result = await getListPage(
      owner,
      'owned',
      parseListQuery({ q: 'zelda' }, []),
      [],
    )
    expect(countCalls).toBe(2)
    expect(result).toMatchObject({ total: 3, itemCount: 120, page: 1 })
  })

  it('gives the last page when the one asked for is past the end', async () => {
    counts = [60]
    pages.push([], [row(1)])
    const result = await getListPage(
      owner,
      'wishlist',
      parseListQuery({ page: '9', size: '50' }, []),
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
      parseListQuery({ page: '4' }, []),
      [],
    )
    expect(result).toMatchObject({ page: 1, total: 0, itemCount: 0, items: [] })
  })
})
