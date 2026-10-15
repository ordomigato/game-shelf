/**
 * Reads every IGDB game anyone has in their library into the catalog
 * (`games`), from IGDB, then prints what it did. Run it through `sst shell`
 * so it gets that stage's database and Twitch credentials:
 *
 *   npx sst shell --stage <stage> -- npx tsx scripts/fill-catalog.ts
 *
 * The server helpers import cleanly outside Nitro: `db.ts` and `igdb.ts`
 * read their secrets from SST's `Resource`, which `sst shell` provides, and
 * the request timing they record does nothing outside a request.
 */
import { and, count, eq, isNotNull, ne } from 'drizzle-orm'
import { games, libraryItems } from '../server/db/schema'
import { ensureCatalogGames } from '../server/utils/catalog'
import { useDb } from '../server/utils/db'

const CHUNK_SIZE = 500
const PAUSE_MS = 300

const db = useDb()
const started = new Date()

const distinct = await db
  .selectDistinct({ igdbId: libraryItems.igdbId })
  .from(libraryItems)
  .where(isNotNull(libraryItems.igdbId))
const ids = distinct.flatMap((row) => (row.igdbId === null ? [] : [row.igdbId]))
console.log(`${ids.length} IGDB games in libraries.`)

let inCatalog = 0
let readNow = 0
let unknown = 0
for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
  const chunk = ids.slice(start, start + CHUNK_SIZE)
  const rows = await ensureCatalogGames(chunk)
  inCatalog += rows.length
  readNow += rows.filter(
    (row) => row.fetchedAt && row.fetchedAt >= started,
  ).length
  unknown += chunk.length - rows.length
  console.log(`${Math.min(start + CHUNK_SIZE, ids.length)} of ${ids.length}`)
  if (start + CHUNK_SIZE < ids.length) {
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
  }
}

const [renamed] = await db
  .select({ value: count() })
  .from(libraryItems)
  .innerJoin(
    games,
    and(eq(games.igdbId, libraryItems.igdbId), isNotNull(games.fetchedAt)),
  )
  .where(ne(libraryItems.name, games.name))

console.log(
  `Filled: ${inCatalog} games are in the catalog, ${readNow} read from IGDB in this run.`,
)
console.log(`IGDB didn't return ${unknown} ids.`)
console.log(
  `${renamed?.value ?? 0} library items have a name different from the catalog's.`,
)
