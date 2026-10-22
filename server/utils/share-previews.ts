import { and, asc, count, desc, eq } from 'drizzle-orm'
import en from '../../i18n/locales/en.json'
import type { ListName } from '../../shared/types/collection'
import type { Message } from '../../shared/types/message'
import { can } from '../../shared/utils/access'
import { igdbImageUrl } from '../../shared/utils/igdb-images'
import {
  collectionPreview,
  parseSharePath,
  shelfPreview,
  type SharePreview,
} from '../../shared/utils/share-preview'
import {
  SITE_NAME,
  canonicalUrl,
  collectionJsonLd,
  jsonLdScript,
  type ListedGame,
} from '../../shared/utils/seo'
import { collectionItems, collections, games, libraryItems } from '../db/schema'
import type { users } from '../db/schema'
import { catalogJoin, itemCoverId, itemName } from './collections'

/**
 * A message in English, the only language so far. Plural messages pick a
 * form by `count` the way vue-i18n does: "none | one | many" or
 * "one | many".
 */
export function translate(message: Message): string {
  const found = message.key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      en,
    )
  if (typeof found !== 'string') return message.key
  let text = found
  const params = message.params ?? {}
  if (text.includes(' | ') && typeof params.count === 'number') {
    const forms = text.split(' | ')
    const n = params.count
    text =
      forms.length === 3
        ? forms[Math.min(n, 2)]!
        : (forms[n === 1 ? 0 : 1] ?? forms[0]!)
  }
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** The size of a collection's cover (IGDB's `cover_big`). */
const COVER_SIZE = { width: 264, height: 374 }
/** The size of the site image, /og.png. */
const SITE_IMAGE_SIZE = { width: 1200, height: 630 }

/** The Open Graph and Twitter tags for a preview, ready for the page head. */
export function previewTags(
  preview: SharePreview,
  url: string,
  site: string,
): string[] {
  const title = translate(preview.title)
  const description = translate(preview.description).slice(0, 300)
  // A collection's first cover when it has one, otherwise the site image.
  const image = preview.image ?? `${site}/og.png`
  const size = preview.image ? COVER_SIZE : SITE_IMAGE_SIZE
  const alt = preview.image ? title : translate({ key: 'preview.imageAlt' })
  const tags: [string, string, string][] = [
    ['name', 'description', description],
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:type', 'website'],
    ['property', 'og:url', url],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:image', image],
    ['property', 'og:image:width', String(size.width)],
    ['property', 'og:image:height', String(size.height)],
    ['property', 'og:image:alt', alt],
    // A portrait cover fits the small card better than the wide one.
    ['name', 'twitter:card', preview.image ? 'summary' : 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', image],
    ['name', 'twitter:image:alt', alt],
  ]
  return tags.map(
    ([attribute, name, content]) =>
      `<meta ${attribute}="${name}" content="${escape(content)}">`,
  )
}

/**
 * Everything the server adds to the head of a shared page: the canonical
 * link, the preview tags and, for a collection or list, its structured data.
 */
export function previewHead(
  preview: SharePreview,
  path: string,
  site: string,
): string[] {
  const url = canonicalUrl(site, preview.path ?? path)
  return [
    `<link rel="canonical" href="${escape(url)}">`,
    ...previewTags(preview, url, site),
    ...(preview.games
      ? [
          `<script type="application/ld+json">${jsonLdScript(
            collectionJsonLd({
              name: translate(preview.title),
              url,
              description: translate(preview.description),
              games: preview.games,
              site,
            }),
          )}</script>`,
        ]
      : []),
  ]
}

/** How many games a collection's structured data names. */
const LISTED_GAMES = 25

/** The image and games for a preview, from a collection's first games. */
function previewGames(
  first: { name: string; igdbId: number | null; coverId: string | null }[],
): { image?: string; games: ListedGame[] } {
  const coverId = first.find((game) => game.coverId)?.coverId
  return {
    ...(coverId && { image: igdbImageUrl(coverId, 'cover_big') }),
    games: first.map(({ name, igdbId }) => ({ name, igdbId })),
  }
}

/**
 * The preview for a public Owned or Wishlist page, built like a
 * collection's. A private list falls back to the generic page.
 */
async function listPreview(
  owner: typeof users.$inferSelect,
  list: ListName,
  ownerName: string,
): Promise<SharePreview | null> {
  // Link previews are for visitors: only what a visitor may open.
  if (!can(null, 'list.read', listResource(owner, list))) return null
  const db = useDb()
  const flag = list === 'owned' ? libraryItems.owned : libraryItems.wishlisted
  const onList = and(eq(libraryItems.ownerId, owner.id), eq(flag, true))
  const [[{ value: itemCount } = { value: 0 }], first] = await Promise.all([
    db.select({ value: count() }).from(libraryItems).where(onList),
    db
      .select({
        name: itemName,
        igdbId: libraryItems.igdbId,
        coverId: itemCoverId,
      })
      .from(libraryItems)
      .leftJoin(games, catalogJoin)
      .where(onList)
      .orderBy(desc(libraryItems.createdAt), desc(libraryItems.id))
      .limit(LISTED_GAMES),
  ])
  return collectionPreview({
    collection: translate({
      key: list === 'owned' ? 'shelf.owned' : 'shelf.wishlist',
    }),
    owner: ownerName,
    description: null,
    itemCount,
    ...previewGames(first),
  })
}

/**
 * The preview for a shared shelf or collection page, or null when the path
 * isn't one, or names something missing or private. Private things fall
 * back to the generic page, so a preview never reveals them.
 */
export async function findSharePreview(
  path: string,
): Promise<SharePreview | null> {
  const target = parseSharePath(path)
  if (!target) return null
  const owner = await findUserByUsername(target.username)
  if (!owner?.username) return null
  const ownerName = owner.displayName || owner.username
  const shelfPath = `/u/${owner.username}/shelf`
  const db = useDb()

  if (!target.slug) {
    const [{ value } = { value: 0 }] = await db
      .select({ value: count() })
      .from(collections)
      .where(
        and(
          eq(collections.ownerId, owner.id),
          eq(collections.visibility, 'public'),
        ),
      )
    return {
      ...shelfPreview({ owner: ownerName, collectionCount: value }),
      path: shelfPath,
    }
  }

  if (target.slug === 'owned' || target.slug === 'wishlist') {
    const preview = await listPreview(owner, target.slug, ownerName)
    return preview && { ...preview, path: `${shelfPath}/${target.slug}` }
  }

  const [collection] = await db
    .select()
    .from(collections)
    .where(
      and(
        eq(collections.ownerId, owner.id),
        eq(collections.slug, target.slug),
        eq(collections.visibility, 'public'),
      ),
    )
  if (
    !collection ||
    !can(null, 'collection.read', {
      ownerId: owner.id,
      visibility: collection.visibility,
    })
  ) {
    return null
  }
  const [[{ value: itemCount } = { value: 0 }], first] = await Promise.all([
    db
      .select({ value: count() })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, collection.id)),
    db
      .select({
        name: itemName,
        igdbId: libraryItems.igdbId,
        coverId: itemCoverId,
      })
      .from(collectionItems)
      .innerJoin(libraryItems, eq(libraryItems.id, collectionItems.itemId))
      .leftJoin(games, catalogJoin)
      .where(eq(collectionItems.collectionId, collection.id))
      .orderBy(asc(collectionItems.position), asc(collectionItems.addedAt))
      .limit(LISTED_GAMES),
  ])
  return {
    ...collectionPreview({
      collection: collection.title,
      owner: ownerName,
      description: collection.description,
      itemCount,
      ...previewGames(first),
    }),
    path: `${shelfPath}/${encodeURIComponent(collection.slug)}`,
  }
}
