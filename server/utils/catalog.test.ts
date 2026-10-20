import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IgdbCatalogGame } from './igdb-queries'
import type { CatalogRow } from './catalog'

const { igdbRequest } = vi.hoisted(() => ({
  igdbRequest: vi.fn<(endpoint: string, query: string) => unknown>(),
}))
vi.mock('./igdb', () => ({ igdbRequest }))

/** What the fake database holds and what was written to it. */
const db = {
  known: [] as CatalogRow[],
  writes: [] as { table: string; values: Record<string, unknown>[] }[],
}

/** An insert that resolves to its own values as rows, like `.returning()`. */
function fakeInsert(table: string, values: Record<string, unknown>[]) {
  db.writes.push({ table, values })
  const rows = values.map((value) => ({
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...value,
  }))
  const query = {
    onConflictDoUpdate: () => query,
    returning: () => query,
    then: (resolve: (value: unknown) => void) => {
      resolve(rows)
    },
  }
  return query
}

vi.mock('./db', async () => {
  const { getTableName } = await import('drizzle-orm')
  return {
    useDb: () => ({
      select: () => ({ from: () => ({ where: () => db.known }) }),
      insert: (table: Parameters<typeof getTableName>[0]) => ({
        values: (values: Record<string, unknown>[]) =>
          fakeInsert(getTableName(table), values),
      }),
      batch: (queries: unknown[]) => Promise.all(queries),
    }),
  }
})

const { CATALOG_MAX_AGE_MS, ensureCatalogGames, idsToFetch } =
  await import('./catalog')

const DAY_MS = 24 * 60 * 60 * 1000

function row(igdbId: number, fetchedAt: Date | null): CatalogRow {
  return {
    igdbId,
    name: `Game ${igdbId}`,
    coverId: null,
    releaseDate: null,
    releasePrecision: null,
    genres: [],
    platformIds: [],
    fetchedAt,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }
}

function igdbGame(id: number): IgdbCatalogGame {
  return {
    id,
    name: `IGDB ${id}`,
    platforms: [{ id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' }],
  }
}

/** Answers each IGDB request with the games it asked for, minus `unknown`. */
function answerIgdb(unknown: number[] = []) {
  igdbRequest.mockImplementation((_endpoint, query) => {
    const ids = /where id = \(([\d,]+)\)/.exec(query)![1]!.split(',')
    return ids
      .map(Number)
      .filter((id) => !unknown.includes(id))
      .map(igdbGame)
  })
}

beforeEach(() => {
  igdbRequest.mockReset()
  db.known = []
  db.writes = []
})

describe('idsToFetch', () => {
  const now = new Date('2026-10-15T12:00:00Z')

  it('picks games missing, never read from IGDB, or read too long ago', () => {
    const rows = [
      row(1, new Date(now.getTime() - DAY_MS)),
      row(2, null),
      row(3, new Date(now.getTime() - CATALOG_MAX_AGE_MS - 1)),
      row(4, new Date(now.getTime() - CATALOG_MAX_AGE_MS + 1)),
    ]
    expect(idsToFetch([1, 2, 3, 4, 5], rows, now)).toEqual([2, 3, 5])
  })
})

describe('ensureCatalogGames', () => {
  it('reads nothing from IGDB when every game is fresh', async () => {
    db.known = [row(1, new Date()), row(2, new Date())]
    const rows = await ensureCatalogGames([2, 1, 2])
    expect(rows.map((game) => game.igdbId)).toEqual([2, 1])
    expect(igdbRequest).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])
  })

  it('reads missing and stale games and writes them with their platforms', async () => {
    db.known = [row(1, new Date()), row(2, null)]
    answerIgdb()
    const rows = await ensureCatalogGames([1, 2, 3])

    expect(igdbRequest).toHaveBeenCalledTimes(1)
    expect(igdbRequest.mock.calls[0]![1]).toContain('where id = (2,3);')
    expect(rows.map((game) => [game.igdbId, game.name])).toEqual([
      [1, 'Game 1'],
      [2, 'IGDB 2'],
      [3, 'IGDB 3'],
    ])
    expect(db.writes.map((write) => write.table)).toEqual([
      'games',
      'platforms',
    ])
    expect(db.writes[1]!.values).toEqual([
      { igdbId: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
    ])
  })

  it('sends one IGDB request per 500 games', async () => {
    answerIgdb()
    const ids = Array.from({ length: 1001 }, (_, i) => i + 1)
    const rows = await ensureCatalogGames(ids)
    expect(igdbRequest).toHaveBeenCalledTimes(3)
    expect(rows).toHaveLength(1001)
  })

  it('leaves out games IGDB does not know', async () => {
    db.known = [row(2, null)]
    answerIgdb([2, 3])
    const rows = await ensureCatalogGames([1, 2, 3])
    expect(rows.map((game) => game.igdbId)).toEqual([1])
  })

  it('throws when IGDB fails, and writes nothing', async () => {
    igdbRequest.mockRejectedValue(
      Object.assign(new Error('Game data is busy'), { statusCode: 503 }),
    )
    await expect(ensureCatalogGames([1])).rejects.toMatchObject({
      statusCode: 503,
    })
    expect(db.writes).toEqual([])
  })

  it('does nothing for no games', async () => {
    expect(await ensureCatalogGames([])).toEqual([])
    expect(igdbRequest).not.toHaveBeenCalled()
  })
})
