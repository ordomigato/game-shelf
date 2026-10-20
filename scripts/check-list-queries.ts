/**
 * Runs the list page queries for one user against a real database and
 * prints one line per case: ok or ERROR, the rows returned, the total
 * matches, and the time. Every sort key in both directions (each account
 * field too), each kind of filter, a search, the first page and a page past
 * the end, for Owned and the Wishlist. Exits 1 if any case fails.
 *
 * It only reads: the queries come from the same builders the list route
 * uses (`getListPage`), which only run SELECTs, and nothing else is called.
 * Run it through `sst shell` so it gets that stage's database:
 *
 *   npx sst shell --stage dev -- npx tsx scripts/check-list-queries.ts <username>
 */
import { neon } from '@neondatabase/serverless'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import { Resource } from 'sst'
import * as schema from '../server/db/schema'
import { LIMIT_REACHED } from '../shared/utils/plans'
import { LIST_SORT_COLUMNS } from '../shared/utils/list-view'
import type { ListName } from '../shared/types/collection'

// The server utils lean on Nitro's auto-imports, which don't exist under
// tsx. Define the ones on their import chain (found by type-checking users,
// collections, lists, list-query, limits, db-errors, positions and the
// shared utils) before loading them. Their `h3` imports are real.
let db: ReturnType<typeof createDb> | undefined
function createDb() {
  return drizzle({ client: neon(Resource.DatabaseUrl.value), schema })
}
function useDb() {
  db ??= createDb()
  return db
}
Object.assign(globalThis, { useDb, LIMIT_REACHED })

// users.ts auto-imports `effectivePlan` and `userLimits`, which live in
// limits.ts, so they can only be set once that file has loaded.
const limits = await import('../server/utils/limits')
Object.assign(globalThis, {
  effectivePlan: limits.effectivePlan,
  userLimits: limits.userLimits,
})
const { findUserByUsername } = await import('../server/utils/users')
const { getUserFields } = await import('../server/utils/collections')
const { getListPage } = await import('../server/utils/lists')
const { parseListQuery } = await import('../server/utils/list-query')

const username = process.argv[2]
if (!username) {
  console.error('Usage: check-list-queries.ts <username>')
  process.exit(2)
}
const user = await findUserByUsername(username)
if (!user) {
  console.error(`No user named ${username}.`)
  process.exit(2)
}
const fields = await getUserFields(user.id)

let failures = 0
let cases = 0

async function run(
  list: ListName,
  label: string,
  raw: Record<string, unknown>,
) {
  cases += 1
  const started = performance.now()
  try {
    const result = await getListPage(
      user!.id,
      list,
      parseListQuery(raw, fields),
      fields,
    )
    const ms = Math.round(performance.now() - started)
    console.log(
      `ok     ${list.padEnd(8)} rows=${String(result.items.length).padStart(4)} total=${String(result.total).padStart(6)} ${String(ms).padStart(5)}ms  ${label}`,
    )
    return result
  } catch (error) {
    failures += 1
    const ms = Math.round(performance.now() - started)
    const message = error instanceof Error ? error.message : String(error)
    console.log(
      `ERROR  ${list.padEnd(8)} rows=   - total=     - ${String(ms).padStart(5)}ms  ${label}  ${message}`,
    )
    return null
  }
}

// The natural sort collation (migration 0020) must exist and order digits by
// value.
{
  cases += 1
  try {
    const result = await useDb().execute(
      sql`select ('Final Fantasy 2' collate "natural_sort") < ('Final Fantasy 10' collate "natural_sort") as natural`,
    )
    const rows = (result as unknown as { rows?: { natural: boolean }[] }).rows
    const natural = rows?.[0]?.natural
    if (natural !== true) throw new Error(`"2" did not sort before "10"`)
    console.log('ok     collation natural_sort puts "Final Fantasy 2" first')
  } catch (error) {
    failures += 1
    console.log(
      `ERROR  collation natural_sort ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

for (const list of ['owned', 'wishlist'] as const) {
  const base = await run(list, 'page 1', {})
  await run(list, 'page 1, 25 rows', { size: '25' })
  await run(list, 'page past the end', { page: '100000' })

  const sorts = [
    ...LIST_SORT_COLUMNS.map((column) => ({ key: column, label: column })),
    ...fields.map((field) => ({
      key: `f.${field.id}`,
      label: `${field.type} field "${field.name}"`,
    })),
  ]
  for (const { key, label } of sorts) {
    for (const dir of ['asc', 'desc']) {
      await run(list, `sort ${label} ${dir}`, { sort: key, dir })
      await run(list, `sort ${label} ${dir}, page 2`, {
        sort: key,
        dir,
        page: '2',
        size: '25',
      })
    }
  }

  await run(list, 'search "a"', { q: 'a' })
  await run(list, 'search two words "a e"', { q: 'a e' })
  await run(list, 'search with wildcards "%_\\"', { q: '%_\\' })
  for (const field of fields.filter((f) =>
    ['text', 'select', 'multiselect'].includes(f.type),
  )) {
    for (const option of field.options ?? []) {
      await run(list, `search ${field.type} value "${option}"`, { q: option })
    }
  }

  const collectionIds = [
    ...new Set(
      (base?.items ?? []).flatMap((item) =>
        (item.inCollections ?? []).map((c) => c.id),
      ),
    ),
  ].slice(0, 2)
  for (const id of collectionIds) {
    await run(list, `filter collection ${id}`, { collection: id })
  }
  if (collectionIds.length > 1) {
    await run(list, 'filter two collections', { collection: collectionIds })
  }
  for (const platform of base?.platforms ?? []) {
    await run(list, `filter platform ${platform.name}`, {
      platform: String(platform.id),
    })
  }
  // Platforms read owned and wanted together: a search by platform name, a
  // filter on two at once, and the sort by the first one.
  const platforms = base?.platforms ?? []
  if (platforms[0]) {
    await run(list, `search platform name ${platforms[0].name}`, {
      q: platforms[0].name,
    })
    await run(list, `filter platform ${platforms[0].name} + sort platforms`, {
      platform: String(platforms[0].id),
      sort: 'platforms',
      dir: 'desc',
      size: '25',
    })
  }
  if (platforms.length > 1) {
    await run(list, 'filter two platforms', {
      platform: platforms.slice(0, 2).map(({ id }) => String(id)),
    })
  }
  // Genres: one, two together, a name that is not a genre, and one beside a
  // sort on the columns that read the same catalog row.
  const genres = base?.genres ?? []
  for (const genre of genres.slice(0, 5)) {
    await run(list, `filter genre ${genre}`, { genre })
  }
  if (genres.length > 1) {
    await run(list, 'filter two genres', { genre: genres.slice(0, 2) })
  }
  await run(list, `filter genre with quotes and wildcards`, {
    genre: `x'%_\\; drop table games`,
  })
  await run(list, 'old sort key year (an alias of released)', { sort: 'year' })
  if (genres[0]) {
    for (const sort of ['released', 'genre']) {
      await run(list, `filter genre ${genres[0]} + sort ${sort} desc`, {
        genre: genres[0],
        sort,
        dir: 'desc',
        size: '25',
      })
    }
  }
  for (const field of fields) {
    if (field.type === 'checkbox') {
      for (const value of ['yes', 'no']) {
        await run(list, `filter ${field.name} = ${value}`, {
          [`f.${field.id}`]: value,
        })
      }
    } else if (field.type === 'select' || field.type === 'multiselect') {
      for (const option of field.options ?? []) {
        await run(list, `filter ${field.name} = ${option}`, {
          [`f.${field.id}`]: option,
        })
      }
    }
  }
  await run(list, 'search + filters + sort together', {
    q: 'a',
    sort: 'name',
    dir: 'desc',
    ...(collectionIds[0] ? { collection: collectionIds[0] } : {}),
  })
}

console.log(`\n${cases} cases, ${failures} failed.`)
process.exit(failures ? 1 : 0)
