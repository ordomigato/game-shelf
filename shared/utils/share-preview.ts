import type { Message } from '../types/message'
import type { ListedGame } from './seo'

/** What a shared link's preview says, as messages to put in the reader's language. */
export interface SharePreview {
  title: Message
  description: Message
  /** An image URL for the preview, when there is one. */
  image?: string
  /**
   * The page's own address, with the owner's real username and the real
   * slug, so every spelling of the address shares one canonical link.
   */
  path?: string
  /** The first games of a collection or list, for its structured data. */
  games?: ListedGame[]
}

/** The shared pages that get a preview: a shelf, or one collection on it. */
export function parseSharePath(
  path: string,
): { username: string; slug?: string } | null {
  const clean = path.split(/[?#]/)[0]!.replace(/\/+$/, '')
  const match = /^\/u\/([^/]+)\/shelf(?:\/([^/]+))?$/.exec(clean)
  if (!match) return null
  try {
    return {
      username: decodeURIComponent(match[1]!).toLowerCase(),
      ...(match[2] && { slug: decodeURIComponent(match[2]) }),
    }
  } catch {
    return null
  }
}

export function collectionPreview(input: {
  collection: string
  owner: string
  description: string | null
  itemCount: number
  image?: string
  games?: ListedGame[]
}): SharePreview {
  return {
    title: {
      key: 'preview.collectionTitle',
      params: { collection: input.collection, owner: input.owner },
    },
    description: input.description
      ? { key: 'preview.text', params: { text: input.description } }
      : {
          key: 'preview.gameCount',
          params: { count: input.itemCount },
        },
    ...(input.image && { image: input.image }),
    ...(input.games && { games: input.games }),
  }
}

export function shelfPreview(input: {
  owner: string
  collectionCount: number
}): SharePreview {
  return {
    title: { key: 'preview.shelfTitle', params: { owner: input.owner } },
    description: {
      key: 'preview.collectionCount',
      params: { count: input.collectionCount },
    },
  }
}
