/**
 * What a visitor to Owned or the Wishlist is looking at: the page, how many
 * rows, the sort, the search and the filters. It travels as the page's URL
 * query and as the list route's query, in the same words.
 */

export const LIST_PAGE_SIZES = [25, 50, 100] as const
export const DEFAULT_LIST_PAGE_SIZE = 50

/** Filter keys that aren't fields. */
export const COLLECTIONS_FILTER = '__collections'
export const PLATFORMS_FILTER = '__platforms'
export const GENRES_FILTER = '__genres'

/** Sort keys for the columns every list has. Fields sort as `f.<id>`. */
export const LIST_SORT_COLUMNS = [
  'name',
  'inCollections',
  'year',
  'genre',
  'platforms',
  'addedAt',
] as const

const FIELD_PREFIX = 'f.'

export interface ListView {
  /** From 1. */
  page: number
  size: number
  /** A sort key, or null for newest first. */
  sort: string | null
  dir: 'asc' | 'desc'
  q: string
  /** Field id (or a filter key above) to the values to keep. */
  filters: Record<string, string[]>
}

/** The sort key for a table column: a field's id becomes `f.<id>`. */
export function sortKeyOf(columnId: string): string {
  return (LIST_SORT_COLUMNS as readonly string[]).includes(columnId)
    ? columnId
    : `${FIELD_PREFIX}${columnId}`
}

/** The table column a sort key belongs to. */
export function columnOfSortKey(key: string): string {
  return key.startsWith(FIELD_PREFIX) ? key.slice(FIELD_PREFIX.length) : key
}

export const isFieldKey = (key: string) => key.startsWith(FIELD_PREFIX)
export const fieldIdOfKey = (key: string) => key.slice(FIELD_PREFIX.length)

type RawQuery = Record<string, unknown>

const many = (value: unknown): string[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .filter((v): v is string => typeof v === 'string')
    .filter(Boolean)

const one = (value: unknown): string | undefined => many(value)[0]

/**
 * The view a URL query describes. Anything unreadable falls back to the
 * default, so a mangled link still opens the list. `defaultSize` is the one
 * the viewer keeps when the query names none.
 */
export function viewFromQuery(query: RawQuery, defaultSize: number): ListView {
  const page = Number(one(query.page))
  const size = Number(one(query.size))
  const filters: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith(FIELD_PREFIX) && key.length > FIELD_PREFIX.length) {
      const values = many(value)
      if (values.length) filters[fieldIdOfKey(key)] = values
    }
  }
  const collections = many(query.collection)
  if (collections.length) filters[COLLECTIONS_FILTER] = collections
  const platforms = many(query.platform)
  if (platforms.length) filters[PLATFORMS_FILTER] = platforms
  const genres = many(query.genre)
  if (genres.length) filters[GENRES_FILTER] = genres
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: (LIST_PAGE_SIZES as readonly number[]).includes(size)
      ? size
      : defaultSize,
    sort: one(query.sort) ?? null,
    dir: one(query.dir) === 'desc' ? 'desc' : 'asc',
    q: one(query.q) ?? '',
    filters,
  }
}

/**
 * The view without a sort or filters on fields that don't exist (any more),
 * as a link kept from before a field was deleted would have.
 */
export function pruneView(view: ListView, fieldIds: Set<string>): ListView {
  const filters = Object.fromEntries(
    Object.entries(view.filters).filter(
      ([key]) =>
        key === COLLECTIONS_FILTER ||
        key === PLATFORMS_FILTER ||
        key === GENRES_FILTER ||
        fieldIds.has(key),
    ),
  )
  const sortGone =
    view.sort !== null &&
    isFieldKey(view.sort) &&
    !fieldIds.has(fieldIdOfKey(view.sort))
  return { ...view, filters, sort: sortGone ? null : view.sort }
}

/**
 * A view as a query. Defaults are left out so URLs stay short, except the
 * size when `withSize` says to keep it.
 */
export function viewToQuery(
  view: ListView,
  options: { withSize: boolean },
): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {}
  if (view.page > 1) query.page = String(view.page)
  if (options.withSize) query.size = String(view.size)
  if (view.sort) {
    query.sort = view.sort
    query.dir = view.dir
  }
  if (view.q.trim()) query.q = view.q.trim()
  for (const [key, values] of Object.entries(view.filters)) {
    if (!values.length) continue
    if (key === COLLECTIONS_FILTER) query.collection = values
    else if (key === PLATFORMS_FILTER) query.platform = values
    else if (key === GENRES_FILTER) query.genre = values
    else query[`${FIELD_PREFIX}${key}`] = values
  }
  return query
}
