import { inArray, sql } from 'drizzle-orm'
import { games, platforms } from '../db/schema'
import { useDb } from './db'
import { igdbRequest } from './igdb'
import {
  buildCatalogQuery,
  CATALOG_BATCH_SIZE,
  toCatalogGame,
  type CatalogGame,
  type CatalogPlatform,
  type IgdbCatalogGame,
} from './igdb-queries'

export type CatalogRow = typeof games.$inferSelect

/** How long a game read from IGDB is trusted before it's read again. */
export const CATALOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * The ids to read from IGDB: ones not in the catalog, ones never read from
 * IGDB, and ones read more than `CATALOG_MAX_AGE_MS` ago.
 */
export function idsToFetch(
  ids: number[],
  rows: Pick<CatalogRow, 'igdbId' | 'fetchedAt'>[],
  now: Date,
): number[] {
  const fetchedAt = new Map(rows.map((row) => [row.igdbId, row.fetchedAt]))
  const oldest = now.getTime() - CATALOG_MAX_AGE_MS
  return ids.filter((id) => {
    const fetched = fetchedAt.get(id)
    return !fetched || fetched.getTime() < oldest
  })
}

/** Sets a column to the value the upsert tried to insert. */
const inserted = (column: string) => sql.raw(`excluded.${column}`)

/** Reads games from IGDB, one request per `CATALOG_BATCH_SIZE` ids. */
async function readFromIgdb(ids: number[]) {
  const found = new Map<number, CatalogGame>()
  const mentioned = new Map<number, CatalogPlatform>()
  // One at a time, so a long list stays inside IGDB's 4 requests a second.
  for (let start = 0; start < ids.length; start += CATALOG_BATCH_SIZE) {
    const batch = ids.slice(start, start + CATALOG_BATCH_SIZE)
    const rows = await igdbRequest<IgdbCatalogGame[]>(
      'games',
      buildCatalogQuery(batch),
    )
    for (const row of rows) {
      const { game, platforms } = toCatalogGame(row)
      found.set(game.igdbId, game)
      for (const platform of platforms) mentioned.set(platform.igdbId, platform)
    }
  }
  return { found: [...found.values()], platforms: [...mentioned.values()] }
}

/**
 * Makes sure the catalog has these IGDB games, reading the missing and
 * stale ones from IGDB (and the platforms they mention), and returns their
 * rows. Ids IGDB doesn't know are left out. An IGDB failure is thrown as
 * `igdbRequest` throws it. Everything written comes from IGDB, never from
 * the request.
 */
export async function ensureCatalogGames(
  igdbIds: number[],
): Promise<CatalogRow[]> {
  const ids = [...new Set(igdbIds)]
  if (!ids.length) return []
  const db = useDb()
  const known = await db.select().from(games).where(inArray(games.igdbId, ids))
  const rows = new Map(known.map((row) => [row.igdbId, row]))

  const stale = idsToFetch(ids, known, new Date())
  const { found, platforms: mentioned } = stale.length
    ? await readFromIgdb(stale)
    : { found: [], platforms: [] }

  if (found.length) {
    const fetchedAt = new Date()
    const upsertGames = db
      .insert(games)
      .values(found.map((game) => ({ ...game, fetchedAt })))
      .onConflictDoUpdate({
        target: games.igdbId,
        set: {
          name: inserted('name'),
          coverId: inserted('cover_id'),
          releaseDate: inserted('release_date'),
          genres: inserted('genres'),
          platformIds: inserted('platform_ids'),
          fetchedAt: inserted('fetched_at'),
          updatedAt: fetchedAt,
        },
      })
      .returning()
    const written = mentioned.length
      ? (
          await db.batch([
            db
              .insert(platforms)
              .values(mentioned)
              .onConflictDoUpdate({
                target: platforms.igdbId,
                set: {
                  name: inserted('name'),
                  abbreviation: inserted('abbreviation'),
                },
              }),
            upsertGames,
          ])
        )[1]
      : await upsertGames
    for (const row of written) rows.set(row.igdbId, row)
  }

  return ids.flatMap((id) => {
    const row = rows.get(id)
    // A row never read from IGDB, that IGDB didn't return just now.
    return row?.fetchedAt ? [row] : []
  })
}
