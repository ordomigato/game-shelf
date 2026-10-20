/**
 * Reads the release date and how exact it is (`release_precision`) from IGDB
 * for every catalog game that has no precision yet, then prints what it did.
 * It writes only those two columns, `release_date` and `release_precision`,
 * and leaves everything else (name, cover, `fetched_at`) as it was. Run it
 * through `sst shell` so it gets that stage's database and Twitch
 * credentials:
 *
 *   npx sst shell --stage dev -- npx tsx scripts/refresh-catalog-dates.ts
 *
 * Games are read 500 to a request, one request at a time with a pause, which
 * stays well inside IGDB's 4 requests a second. Like `fill-catalog.ts`, the
 * server helpers it uses import cleanly outside Nitro. It can be run again:
 * it only picks games still without a precision.
 */
import { count, isNull, sql } from 'drizzle-orm'
import { games } from '../server/db/schema'
import { useDb } from '../server/utils/db'
import { igdbRequest } from '../server/utils/igdb'
import {
  buildReleaseDatesQuery,
  CATALOG_BATCH_SIZE,
  releasePrecisionOf,
  type IgdbCatalogGame,
} from '../server/utils/igdb-queries'

const PAUSE_MS = 300

const db = useDb()

const missing = await db
  .select({ igdbId: games.igdbId })
  .from(games)
  .where(isNull(games.releasePrecision))
const ids = missing.map((row) => row.igdbId)
console.log(`${ids.length} catalog games have no release precision.`)

const byPrecision = new Map<string, number>()
let updated = 0
let unknown = 0
for (let start = 0; start < ids.length; start += CATALOG_BATCH_SIZE) {
  const batch = ids.slice(start, start + CATALOG_BATCH_SIZE)
  const rows = await igdbRequest<IgdbCatalogGame[]>(
    'games',
    buildReleaseDatesQuery(batch),
  )
  const values = rows.flatMap((row) => {
    const precision = releasePrecisionOf(row)
    if (!precision) return []
    const date =
      row.first_release_date === undefined
        ? null
        : new Date(row.first_release_date * 1000).toISOString().slice(0, 10)
    byPrecision.set(precision, (byPrecision.get(precision) ?? 0) + 1)
    return [sql`(${row.id}::int, ${date}::date, ${precision}::text)`]
  })
  unknown += batch.length - values.length
  if (values.length) {
    await db.execute(
      sql`update games set release_date = fresh.release_date, release_precision = fresh.release_precision
        from (values ${sql.join(values, sql`, `)}) as fresh(igdb_id, release_date, release_precision)
        where games.igdb_id = fresh.igdb_id`,
    )
    updated += values.length
  }
  console.log(
    `${Math.min(start + CATALOG_BATCH_SIZE, ids.length)} of ${ids.length}`,
  )
  if (start + CATALOG_BATCH_SIZE < ids.length) {
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
  }
}

const [left] = await db
  .select({ value: count() })
  .from(games)
  .where(isNull(games.releasePrecision))
console.log(`Updated ${updated} games.`)
for (const [precision, total] of [...byPrecision].sort()) {
  console.log(`  ${precision}: ${total}`)
}
console.log(
  `${unknown} games had no release precision from IGDB (not returned, or no release dates).`,
)
console.log(`${left?.value ?? 0} catalog games still have no precision.`)
