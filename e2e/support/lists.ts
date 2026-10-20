import type { Page } from '@playwright/test'

interface Field {
  id: string
  name: string
  type: string
  options?: string[]
  hidden?: true
}

export interface FakeEntry {
  id: string
  name: string
  addedAt: string
  data: Record<string, unknown>
  inCollections?: { id: string }[]
  /**
   * Short platform names for a game's own list. The fake turns them into
   * catalog platforms and the platforms owned (or wanted) on, like the
   * server does.
   */
  platforms?: string[]
  year?: number | null
  genres?: string[]
  [key: string]: unknown
}

/**
 * Stands in for the list route: pages, sorts, searches and filters the
 * given games the way the server does, and keeps every request it saw.
 * `items` can be changed between requests, like the database would be.
 */
export async function fakeList(
  page: Page,
  username: string,
  list: 'owned' | 'wishlist',
  start: FakeEntry[],
  options: {
    fields?: Field[]
    platforms?: { id: number; name: string }[]
    /** Genres to filter by. Defaults to the ones the games have. */
    genres?: string[]
    /** Held back this long before answering, per request number. */
    delay?: (request: number) => number
    /** Games in the whole library, owned and wishlisted. Defaults to this list's. */
    libraryCount?: number
  } = {},
) {
  const fields = options.fields ?? []
  const state = {
    items: [...start],
    requests: [] as URL[],
    /** The columns hidden on this list, as the server would keep them. */
    hidden: [] as string[],
    /** What each save of the hidden columns sent. */
    columnSaves: [] as string[][],
    remove(id: string) {
      state.items = state.items.filter((item) => item.id !== id)
    },
    update(id: string, change: Partial<FakeEntry>) {
      state.items = state.items.map((item) =>
        item.id === id ? { ...item, ...change } : item,
      )
    },
  }

  /** An id for a platform name, the same every time. */
  const platformId = (name: string) =>
    [...name].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) % 100_000

  /** The game as the server sends it: with its year, genres and platforms. */
  const served = (item: FakeEntry): FakeEntry => {
    const { platforms: names = [], ...rest } = item
    // The names are this list's platforms: the ids the fixture gives for
    // them, else made-up ones.
    const given = (list === 'owned' ? item.ownedOn : item.wantedOn) as
      number[] | undefined
    const ids = given?.length === names.length ? given : names.map(platformId)
    const own = list === 'owned' ? 'ownedOn' : 'wantedOn'
    return {
      year: null,
      genres: [],
      catalogPlatforms: names.map((name, i) => ({ id: ids[i]!, name })),
      ownedOn: [],
      wantedOn: [],
      ...rest,
      ...(names.length && { [own]: ids }),
    }
  }

  const emptyLast = (a: unknown, b: unknown, dir: number) => {
    const none = (v: unknown) => v === undefined || v === null || v === ''
    if (none(a) || none(b)) return none(a) ? (none(b) ? 0 : 1) : -1
    const x = typeof a === 'string' ? a.toLowerCase() : (a as number)
    const y = typeof b === 'string' ? b.toLowerCase() : (b as number)
    return (x < y ? -1 : x > y ? 1 : 0) * dir
  }

  await page.route(`**/api/me/list-columns/${list}`, (route) => {
    const body = route.request().postDataJSON() as { hidden: string[] }
    state.columnSaves.push(body.hidden)
    state.hidden = body.hidden
    return route.fulfill({ json: body.hidden })
  })
  await page.route(
    new RegExp(`/api/u/${username}/lists/${list}(\\?.*)?$`),
    async (route) => {
      const url = new URL(route.request().url())
      state.requests.push(url)
      const delay = options.delay?.(state.requests.length) ?? 0
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      const q = url.searchParams
      const size = Number(q.get('size') ?? 50)
      const search = (q.get('q') ?? '').toLowerCase()
      let rows = state.items
        .map(served)
        .filter((item) => item.name.toLowerCase().includes(search))
      const genres = q.getAll('genre')
      if (genres.length) {
        rows = rows.filter((item) =>
          item.genres?.some((genre) => genres.includes(genre)),
        )
      }
      const collections = q.getAll('collection')
      if (collections.length) {
        rows = rows.filter((item) =>
          item.inCollections?.some(({ id }) => collections.includes(id)),
        )
      }
      for (const field of fields) {
        const wanted = q.getAll(`f.${field.id}`)
        if (!wanted.length) continue
        rows = rows.filter((item) => {
          const value = item.data[field.id]
          if (field.type === 'checkbox') {
            return wanted.includes(value === true ? 'yes' : 'no')
          }
          if (Array.isArray(value)) return value.some((v) => wanted.includes(v))
          return typeof value === 'string' && wanted.includes(value)
        })
      }
      const sort = q.get('sort')
      const dir = q.get('dir') === 'desc' ? -1 : 1
      const key = (item: FakeEntry): unknown => {
        if (sort === 'name') return item.name
        if (sort === 'addedAt') return item.addedAt
        if (sort === 'year') return item.year
        if (sort === 'genre') return item.genres?.[0]
        if (sort === 'platforms') {
          const ids = (item.ownedOn ?? []) as number[]
          return (item.catalogPlatforms as { id: number; name: string }[]).find(
            ({ id }) => ids.includes(id),
          )?.name
        }
        if (sort === 'inCollections') return item.inCollections?.length
        return item.data[String(sort).slice(2)]
      }
      rows = [...rows].sort((a, b) => {
        const byColumn = sort ? emptyLast(key(a), key(b), dir) : 0
        return (
          byColumn ||
          b.addedAt.localeCompare(a.addedAt) ||
          b.id.localeCompare(a.id)
        )
      })
      const pages = Math.max(1, Math.ceil(rows.length / size))
      const current = Math.min(Number(q.get('page') ?? 1), pages)
      await route.fulfill({
        json: {
          list,
          itemCount: state.items.length,
          libraryCount: options.libraryCount ?? state.items.length,
          total: rows.length,
          page: current,
          size,
          fields,
          platforms: options.platforms ?? [],
          genres:
            options.genres ??
            [
              ...new Set(state.items.flatMap((item) => item.genres ?? [])),
            ].sort(),
          hiddenColumns: state.hidden,
          items: rows.slice((current - 1) * size, current * size),
        },
      })
    },
  )
  return state
}
