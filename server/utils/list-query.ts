import { and, eq, sql, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import { z } from 'zod'
import type { FieldDefinition, ListName } from '../../shared/types/collection'
import {
  fieldIdOfKey,
  isFieldKey,
  LIST_SORT_COLUMNS,
  sortKeyFromQuery,
} from '../../shared/utils/list-view'
import { games as catalogGames, libraryItems } from '../db/schema'
import { itemName } from './collections'

/** What a list page asks for, once checked against the user's fields. */
export interface ListQuery {
  page: number
  size: number
  sort: ListSort | null
  dir: 'asc' | 'desc'
  /** Text the game's name must contain. Empty for no search. */
  q: string
  /** The fields whose text a search reads: text, select and multiselect. */
  searchFields: FieldDefinition[]
  collectionIds: string[]
  platformIds: number[]
  /** Genre names: a game matches when it has any of them. */
  genres: string[]
  fieldFilters: { field: FieldDefinition; values: string[] }[]
}

export type ListSort =
  { column: (typeof LIST_SORT_COLUMNS)[number] } | { field: FieldDefinition }

const FILTERABLE: FieldDefinition['type'][] = [
  'checkbox',
  'select',
  'multiselect',
]
const MAX_FILTER_FIELDS = 30

const asArray = (value: unknown) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

const baseSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  size: z
    .enum(['25', '50', '100'])
    .default('50')
    .transform((size) => Number(size)),
  sort: z.string().max(80).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
  q: z.string().trim().max(100).default(''),
  collection: z.preprocess(asArray, z.array(z.uuid()).max(50)),
  platform: z.preprocess(
    asArray,
    z.array(z.coerce.number().int().positive().max(2_000_000_000)).max(50),
  ),
  genre: z.preprocess(asArray, z.array(z.string().min(1).max(100)).max(50)),
})

const badRequest = (statusMessage: string) =>
  createError({ statusCode: 400, statusMessage })

/**
 * Reads a list route's query string. Every part is checked against an allow
 * list: sort keys are the known columns or one of the user's own field ids,
 * and so are filter fields (`f.<id>`), whose values must be what that kind
 * of field offers. Anything else is a 400, so no input reaches SQL as
 * anything but a bound value.
 */
export function parseListQuery(
  raw: Record<string, unknown>,
  fields: FieldDefinition[],
): ListQuery {
  const parsed = baseSchema.safeParse(raw)
  if (!parsed.success) throw badRequest('Invalid list query')
  const { sort: rawSortKey, collection, platform, genre, ...rest } = parsed.data
  const byId = new Map(fields.map((field) => [field.id, field]))

  const sortKey = sortKeyFromQuery(rawSortKey)
  let sort: ListSort | null = null
  if (sortKey !== null) {
    if (isFieldKey(sortKey)) {
      // A field since deleted: the link still opens, in the default order.
      const field = byId.get(fieldIdOfKey(sortKey))
      if (field) sort = { field }
    } else {
      const column = LIST_SORT_COLUMNS.find((known) => known === sortKey)
      if (!column) throw badRequest('Unknown sort')
      sort = { column }
    }
  }

  const fieldFilters: ListQuery['fieldFilters'] = []
  for (const [key, value] of Object.entries(raw)) {
    if (!isFieldKey(key)) continue
    // A filter on a field since deleted (or one that can't be filtered) is
    // dropped, not an error.
    const field = byId.get(fieldIdOfKey(key))
    if (!field || !FILTERABLE.includes(field.type)) continue
    const values = asArray(value)
    if (values.length > 100 || values.some((v) => typeof v !== 'string')) {
      throw badRequest('Invalid filter')
    }
    const strings = values as string[]
    if (
      field.type === 'checkbox' &&
      strings.some((v) => v !== 'yes' && v !== 'no')
    ) {
      throw badRequest('Invalid filter')
    }
    if (strings.some((v) => v.length > 200)) throw badRequest('Invalid filter')
    if (strings.length) fieldFilters.push({ field, values: strings })
  }
  if (fieldFilters.length > MAX_FILTER_FIELDS) {
    throw badRequest('Too many filters')
  }

  return {
    ...rest,
    sort,
    searchFields: fields.filter((field) =>
      ['text', 'select', 'multiselect'].includes(field.type),
    ),
    collectionIds: collection,
    platformIds: platform,
    genres: genre,
    fieldFilters,
  }
}

/** Whether anything narrows the list. */
export const isFiltered = (query: ListQuery) =>
  Boolean(
    query.q ||
    query.collectionIds.length ||
    query.platformIds.length ||
    query.genres.length ||
    query.fieldFilters.length,
  )

/**
 * Every platform the owner has the game on, owned and wanted together:
 * what the platforms cell shows on both lists.
 */
const allPlatforms = sql.raw(
  'library_items.owned_on || library_items.wanted_on',
)

const textList = (values: string[]) =>
  sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`

const intList = (values: number[]) =>
  sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::integer[]`

/** `%`, `_` and `\` in text typed by a person, so LIKE reads them literally. */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&')

/** The value of a field on the row, as jsonb. The id is a bound value. */
const valueOf = (field: FieldDefinition) =>
  sql`(library_items.data -> ${field.id}::text)`

/** Matches one field filter, with the meaning the table has on screen. */
function fieldFilter(field: FieldDefinition, values: string[]): SQL | null {
  const value = valueOf(field)
  if (field.type === 'checkbox') {
    const yes = values.includes('yes')
    const no = values.includes('no')
    // Both ticked or unticked matches every game.
    if (yes === no) return null
    const ticked = sql`(${value} = 'true'::jsonb)`
    return yes
      ? sql`coalesce(${ticked}, false)`
      : sql`not coalesce(${ticked}, false)`
  }
  if (field.type === 'select') {
    return sql`(case when jsonb_typeof(${value}) = 'string' then (${value} #>> '{}') = any(${textList(values)}) else false end)`
  }
  // A list of choices matches when it has any of the wanted ones. The
  // array function only runs on arrays: SQL doesn't promise `and` stops early.
  return sql`(case when jsonb_typeof(${value}) = 'array' then exists (select 1 from jsonb_array_elements_text(${value}) as choice(name) where choice.name = any(${textList(values)})) else false end)`
}

/** Whether a word appears in the parts of a game the search reads. */
function wordMatch(
  ownerId: string,
  searchFields: FieldDefinition[],
  word: string,
): SQL {
  const pattern = `%${escapeLike(word)}%`
  const like = (column: SQL) => sql`${column} ilike ${pattern} escape '\\'`
  const parts: SQL[] = [
    like(sql`${itemName}`),
    sql`exists (select 1 from collection_items as entry inner join collections as searched_collection on searched_collection.id = entry.collection_id where entry.item_id = library_items.id and searched_collection.owner_id = ${ownerId} and ${like(sql`searched_collection.title`)})`,
    sql`exists (select 1 from platforms as searched_platform where searched_platform.igdb_id = any(${allPlatforms}) and ${like(sql`coalesce(searched_platform.abbreviation, searched_platform.name)`)})`,
  ]
  for (const field of searchFields) {
    const value = valueOf(field)
    parts.push(
      field.type === 'multiselect'
        ? sql`(case when jsonb_typeof(${value}) = 'array' then exists (select 1 from jsonb_array_elements_text(${value}) as searched_choice(name) where ${like(sql`searched_choice.name`)}) else false end)`
        : sql`(case when jsonb_typeof(${value}) = 'string' then ${like(sql`(${value} #>> '{}')`)} else false end)`,
    )
  }
  return sql`(${sql.join(parts, sql` or `)})`
}

/**
 * The rows of one list that match, always the owner's. Must run against a
 * query from `library_items` left joined to the catalog game.
 */
export function listWhere(
  ownerId: string,
  list: ListName,
  query: ListQuery,
): SQL {
  const conditions: (SQL | undefined)[] = [
    eq(libraryItems.ownerId, ownerId),
    eq(list === 'owned' ? libraryItems.owned : libraryItems.wishlisted, true),
  ]
  // Every word must be found somewhere: in the name, a text or choice value,
  // a collection title or a platform name.
  for (const word of query.q.split(/\s+/).filter(Boolean)) {
    conditions.push(wordMatch(ownerId, query.searchFields, word))
  }
  if (query.collectionIds.length) {
    conditions.push(
      sql`exists (select 1 from collection_items as entry inner join collections as owned_collection on owned_collection.id = entry.collection_id where entry.item_id = library_items.id and owned_collection.owner_id = ${ownerId} and entry.collection_id = any(${textList(query.collectionIds)}::uuid[]))`,
    )
  }
  if (query.platformIds.length) {
    conditions.push(sql`(${allPlatforms}) && ${intList(query.platformIds)}`)
  }
  if (query.genres.length) {
    // Games added by hand have no catalog row, so no genres: the guard keeps
    // the array operator off a null.
    conditions.push(
      sql`(case when ${catalogGames.igdbId} is not null then ${catalogGames.genres} && ${textList(query.genres)} else false end)`,
    )
  }
  for (const { field, values } of query.fieldFilters) {
    const condition = fieldFilter(field, values)
    if (condition) conditions.push(condition)
  }
  return and(...conditions)!
}

/** The value a field sorts by. Missing or wrong-typed values are null. */
function fieldSortValue(field: FieldDefinition): SQL {
  const value = valueOf(field)
  const scalar = sql`(${value} #>> '{}')`
  switch (field.type) {
    case 'number':
    case 'currency':
    case 'rating':
    case 'progress':
      return sql`(case when jsonb_typeof(${value}) = 'number' then ${scalar}::numeric end)`
    case 'checkbox':
      // Ticked first when ascending, like the table on screen.
      return sql`(case when jsonb_typeof(${value}) = 'boolean' then not ${scalar}::boolean end)`
    case 'date':
      return sql`(case when jsonb_typeof(${value}) = 'string' then ${scalar} end)`
    case 'multiselect':
      return sql`(case when jsonb_typeof(${value}) = 'array' then (select lower(string_agg(choice.name, ', ' order by choice.idx)) from jsonb_array_elements_text(${value}) with ordinality as choice(name, idx)) end)`
    default:
      return sql`(case when jsonb_typeof(${value}) = 'string' then lower(${scalar}) end)`
  }
}

function sortValue(sort: ListSort, ownerId: string): SQL {
  if ('field' in sort) return fieldSortValue(sort.field)
  switch (sort.column) {
    case 'name':
      return sql`lower(${itemName})`
    case 'addedAt':
      return sql`library_items.created_at`
    case 'released':
      // TBD has no date to speak of, so it goes last with the empty.
      return sql`(case when ${catalogGames.releasePrecision} = 'tbd' then null else ${catalogGames.releaseDate} end)`
    case 'genre':
      return sql`lower((${catalogGames.genres})[1])`
    case 'platforms':
      // The first owned platform, else the first wanted one.
      return sql`(select lower(coalesce(first_platform.abbreviation, first_platform.name)) from platforms as first_platform where first_platform.igdb_id = coalesce((library_items.owned_on)[1], (library_items.wanted_on)[1]))`
    case 'inCollections':
      return sql`(select string_agg(lower(sorted_collection.title), ', ' order by lower(sorted_collection.title)) from collection_items as entry inner join collections as sorted_collection on sorted_collection.id = entry.collection_id where entry.item_id = library_items.id and sorted_collection.owner_id = ${ownerId})`
  }
}

/**
 * The ICU collation (made by a migration) that orders digits by value.
 */
export const NATURAL_COLLATION = 'natural_sort'

/** Whether a sort compares words, so it takes the natural collation. */
function sortsAsText(sort: ListSort): boolean {
  if ('field' in sort) {
    return ['text', 'select', 'multiselect'].includes(sort.field.type)
  }
  return sort.column !== 'addedAt' && sort.column !== 'released'
}

/**
 * The order of a page: the chosen column (empty values last either way),
 * then newest first and by id, so the same game never lands on two pages
 * or on none.
 */
export function listOrder(
  ownerId: string,
  list: ListName,
  query: ListQuery,
): SQL[] {
  const tiebreak = [
    sql`library_items.created_at desc`,
    sql`library_items.id desc`,
  ]
  if (!query.sort) return tiebreak
  const direction = query.dir === 'desc' ? sql.raw('desc') : sql.raw('asc')
  // Text compares numbers as numbers: "Final Fantasy 2" before "... 10".
  const collation = sortsAsText(query.sort)
    ? sql.raw(` collate "${NATURAL_COLLATION}"`)
    : sql.raw('')
  return [
    sql`${sortValue(query.sort, ownerId)}${collation} ${direction} nulls last`,
    ...tiebreak,
  ]
}
