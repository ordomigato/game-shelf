import { and, asc, count, eq, isNotNull } from 'drizzle-orm'
import en from '../../i18n/locales/en.json'
import type { Message } from '../../shared/types/message'
import { igdbImageUrl } from '../../shared/utils/igdb-images'
import {
  collectionPreview,
  parseSharePath,
  shelfPreview,
  type SharePreview,
} from '../../shared/utils/share-preview'
import { collectionItems, collections, libraryItems } from '../db/schema'

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

/** The Open Graph and Twitter tags for a preview, ready for the page head. */
export function previewTags(preview: SharePreview, url: string): string[] {
  const title = translate(preview.title)
  const description = translate(preview.description).slice(0, 300)
  const tags: [string, string, string][] = [
    ['name', 'description', description],
    ['property', 'og:site_name', 'GameShelf'],
    ['property', 'og:type', 'website'],
    ['property', 'og:url', url],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['name', 'twitter:card', 'summary'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
  ]
  if (preview.image) {
    tags.push(['property', 'og:image', preview.image])
    tags.push(['name', 'twitter:image', preview.image])
  }
  return tags.map(
    ([attribute, name, content]) =>
      `<meta ${attribute}="${name}" content="${escape(content)}">`,
  )
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
    return shelfPreview({ owner: ownerName, collectionCount: value })
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
  if (!collection) return null
  const [[{ value: itemCount } = { value: 0 }], [cover]] = await Promise.all([
    db
      .select({ value: count() })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, collection.id)),
    db
      .select({ coverId: libraryItems.coverId })
      .from(collectionItems)
      .innerJoin(libraryItems, eq(libraryItems.id, collectionItems.itemId))
      .where(
        and(
          eq(collectionItems.collectionId, collection.id),
          isNotNull(libraryItems.coverId),
        ),
      )
      .orderBy(asc(collectionItems.position), asc(collectionItems.addedAt))
      .limit(1),
  ])
  return collectionPreview({
    collection:
      collection.kind === 'wishlist'
        ? translate({ key: 'shelf.wishlist' })
        : collection.title,
    owner: ownerName,
    description: collection.description,
    itemCount,
    image: cover?.coverId
      ? igdbImageUrl(cover.coverId, 'cover_big')
      : undefined,
  })
}
