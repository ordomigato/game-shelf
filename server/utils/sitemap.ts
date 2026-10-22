import { sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { can } from '../../shared/utils/access'
import { INDEXABLE_PAGES } from '../../shared/utils/seo'

/** The most URLs one sitemap file may list (the sitemap protocol's limit). */
export const SITEMAP_LIMIT = 50_000

export interface SitemapEntry {
  /** The path on the site, like `/games/1026`. */
  path: string
  /** When the page last changed, only where that is really known. */
  lastmod?: Date
}

/** What the sitemap is built from. Pure data, so it can be tested. */
export interface SitemapData {
  gameIds: number[]
  users: {
    username: string
    ownedPublic: boolean
    wishlistPublic: boolean
    /** Whether Owned or the Wishlist has any games on it. */
    hasOwned: boolean
    hasWishlist: boolean
  }[]
  collections: {
    username: string
    slug: string
    visibility: 'private' | 'public'
    itemCount: number
    lastmod: Date | null
  }[]
}

const encodePart = (part: string) => encodeURIComponent(part)

/**
 * Every page worth listing: the fixed pages, each game, and only what
 * people made public. A private collection, a private list or a user with
 * nothing public never appears, and neither does an empty page.
 */
export function sitemapEntries(data: SitemapData): SitemapEntry[] {
  const entries: SitemapEntry[] = INDEXABLE_PAGES.map((path) => ({ path }))
  for (const id of data.gameIds) entries.push({ path: `/games/${id}` })

  const shelves = new Map<string, SitemapEntry[]>()
  const add = (username: string, entry: SitemapEntry) => {
    const list = shelves.get(username) ?? []
    list.push(entry)
    shelves.set(username, list)
  }
  // The sitemap is for visitors: a page is listed only if a visitor may open it.
  const visitorMayOpen = (isPublic: boolean) =>
    can(null, 'list.read', { visibility: isPublic ? 'public' : 'private' })
  for (const user of data.users) {
    const base = `/u/${encodePart(user.username)}/shelf`
    if (visitorMayOpen(user.ownedPublic) && user.hasOwned) {
      add(user.username, { path: `${base}/owned` })
    }
    if (visitorMayOpen(user.wishlistPublic) && user.hasWishlist) {
      add(user.username, { path: `${base}/wishlist` })
    }
  }
  for (const collection of data.collections) {
    if (
      !can(null, 'collection.read', { visibility: collection.visibility }) ||
      collection.itemCount < 1
    ) {
      continue
    }
    add(collection.username, {
      path: `/u/${encodePart(collection.username)}/shelf/${encodePart(collection.slug)}`,
      ...(collection.lastmod && { lastmod: collection.lastmod }),
    })
  }
  // A shelf page lists what is public on it, so it appears with the first
  // public thing, and is as new as the newest of them.
  for (const [username, pages] of shelves) {
    const dates = pages.flatMap((page) => (page.lastmod ? [page.lastmod] : []))
    const newest = dates.length
      ? new Date(Math.max(...dates.map((date) => date.getTime())))
      : undefined
    entries.push({
      path: `/u/${encodePart(username)}/shelf`,
      ...(newest && { lastmod: newest }),
    })
    entries.push(...pages)
  }
  return entries
}

/**
 * CloudFront may serve a sitemap for 4 hours without asking the server, then
 * for up to a day more while it fetches a fresh one. Only a built sitemap
 * gets this: an error is not cached.
 */
export function setSitemapHeaders(event: H3Event) {
  setResponseHeaders(event, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, s-maxage=14400, stale-while-revalidate=86400',
  })
}

/**
 * CloudFront keeps a copy per query string, so `?x=1`, `?x=2` would each
 * rebuild the sitemap. A request with one is sent to the bare address, which
 * is cheap and cached. This is that address, or null when there is no query.
 */
export function bareSitemapPath(event: H3Event): string | null {
  const { pathname, search } = getRequestURL(event)
  return search ? pathname : null
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n'
const NAMESPACE = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'

/** One sitemap file: a list of pages. */
export function urlsetXml(entries: SitemapEntry[], site: string): string {
  const urls = entries.map(({ path, lastmod }) => {
    const modified = lastmod
      ? `<lastmod>${lastmod.toISOString()}</lastmod>`
      : ''
    return `<url><loc>${escapeXml(site + path)}</loc>${modified}</url>`
  })
  return `${XML_HEAD}<urlset ${NAMESPACE}>\n${urls.join('\n')}\n</urlset>\n`
}

/** A sitemap that points to other sitemap files. */
export function indexXml(locations: string[]): string {
  const maps = locations.map(
    (loc) => `<sitemap><loc>${escapeXml(loc)}</loc></sitemap>`,
  )
  return `${XML_HEAD}<sitemapindex ${NAMESPACE}>\n${maps.join('\n')}\n</sitemapindex>\n`
}

/** Splits the pages into files of at most `limit`, always at least one. */
export function chunkEntries(
  entries: SitemapEntry[],
  limit = SITEMAP_LIMIT,
): SitemapEntry[][] {
  const chunks: SitemapEntry[][] = []
  for (let start = 0; start < entries.length; start += limit) {
    chunks.push(entries.slice(start, start + limit))
  }
  return chunks.length ? chunks : [[]]
}

interface GameRow extends Record<string, unknown> {
  igdb_id: number
}
interface UserRow extends Record<string, unknown> {
  username: string
  owned_public: boolean
  wishlist_public: boolean
  has_owned: boolean
  has_wishlist: boolean
}
interface CollectionRow extends Record<string, unknown> {
  username: string
  slug: string
  visibility: 'private' | 'public'
  item_count: number
  lastmod: string | Date | null
}

/**
 * Reads what the sitemap lists. The queries already leave out private
 * things, and `sitemapEntries` checks again, so a slip in one can't list one.
 */
export async function loadSitemapData(): Promise<SitemapData> {
  const db = useDb()
  const [games, users, collections] = await Promise.all([
    db.execute<GameRow>(sql`select igdb_id from games order by igdb_id`),
    db.execute<UserRow>(sql`
      select
        u.username, u.owned_public, u.wishlist_public,
        exists (
          select 1 from library_items as li
          where li.owner_id = u.id and li.owned
        ) as has_owned,
        exists (
          select 1 from library_items as li
          where li.owner_id = u.id and li.wishlisted
        ) as has_wishlist
      from users as u
      where u.username is not null
        and (u.owned_public or u.wishlist_public)
      order by u.username
    `),
    db.execute<CollectionRow>(sql`
      select
        u.username, c.slug, c.visibility,
        stats.item_count,
        greatest(c.updated_at, stats.last_added) as lastmod
      from collections as c
      join users as u on u.id = c.owner_id
      join lateral (
        select count(*)::int as item_count, max(entry.added_at) as last_added
        from collection_items as entry
        where entry.collection_id = c.id
      ) as stats on true
      where c.visibility = 'public'
        and u.username is not null
        and stats.item_count > 0
      order by u.username, c.slug
    `),
  ])
  return {
    gameIds: games.rows.map((row) => row.igdb_id),
    users: users.rows.map((row) => ({
      username: row.username,
      ownedPublic: row.owned_public,
      wishlistPublic: row.wishlist_public,
      hasOwned: row.has_owned,
      hasWishlist: row.has_wishlist,
    })),
    collections: collections.rows.map((row) => ({
      username: row.username,
      slug: row.slug,
      visibility: row.visibility,
      itemCount: row.item_count,
      lastmod: row.lastmod ? new Date(row.lastmod) : null,
    })),
  }
}
