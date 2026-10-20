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
import { sql } from 'drizzle-orm'
import { useDb } from '../server/utils/db'
import { findUserByUsername } from '../server/utils/users'
import { getUserFields } from '../server/utils/collections'
import { getListPage } from '../server/utils/lists'
import { parseListQuery } from '../server/utils/list-query'
import { LIST_SORT_COLUMNS } from '../shared/utils/list-view'
import type { ListName } from '../shared/types/collection'

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
