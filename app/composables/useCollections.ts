import { ofetch } from 'ofetch'
import type {
  CollectionDetail,
  CollectionSummary,
  LibraryItem,
} from '#shared/types/collection'
import type { StarterBlueprint } from '#shared/utils/starter-blueprints'

/**
 * Reading and changing collections. Reads send the access token when signed
 * in, so the server can tell the owner (who sees everything) from visitors
 * (public collections only).
 */
export function useCollections() {
  const auth = useAuth()

  async function viewerFetch<T>(url: string): Promise<T> {
    await auth.ensureLoaded()
    return auth.status.value === 'signedIn'
      ? auth.apiFetch<T>(url)
      : ofetch<T>(url)
  }

  const userPath = (username: string) =>
    `/api/u/${encodeURIComponent(username)}/collections`

  return {
    /** Whether `username` is the signed-in user. */
    isMine: (username: string) =>
      auth.me.value?.username === username.toLowerCase(),

    list: (username: string) =>
      viewerFetch<CollectionSummary[]>(userPath(username)),

    get: (username: string, slug: string) =>
      viewerFetch<CollectionDetail>(
        `${userPath(username)}/${encodeURIComponent(slug)}`,
      ),

    create: (input: {
      title: string
      description: string | null
      starter: StarterBlueprint
    }) =>
      auth.apiFetch<CollectionSummary>('/api/collections', {
        method: 'POST',
        body: input,
      }),

    update: (
      id: string,
      changes: { title?: string; description?: string | null },
    ) =>
      auth.apiFetch<CollectionSummary>(`/api/collections/${id}`, {
        method: 'PATCH',
        body: changes,
      }),

    remove: (id: string) =>
      auth.apiFetch(`/api/collections/${id}`, { method: 'DELETE' }),

    /** The signed-in user's own collections, Wishlist first. */
    mine: () => auth.apiFetch<CollectionSummary[]>('/api/collections'),

    /** The user's item for an IGDB game, if any, and its collections. */
    membership: (igdbId: number) =>
      auth.apiFetch<{ item: LibraryItem | null; collectionIds: string[] }>(
        `/api/library-items/igdb/${igdbId}`,
      ),

    /** Of these IGDB games, the ones already in a collection. */
    tracked: (igdbIds: number[]) =>
      auth.apiFetch<number[]>(
        `/api/library-items/igdb?ids=${igdbIds.join(',')}`,
      ),

    /** Adds an IGDB game to the library (once) and to these collections. */
    addGame: (
      game: { igdbId: number; name: string; coverId: string | null },
      collectionIds: string[],
    ) =>
      auth.apiFetch<{ item: LibraryItem; collectionIds: string[] }>(
        '/api/library-items',
        { method: 'POST', body: { ...game, collectionIds } },
      ),

    addItem: (collectionId: string, itemId: string) =>
      auth.apiFetch(`/api/collections/${collectionId}/items/${itemId}`, {
        method: 'PUT',
      }),

    removeItem: (collectionId: string, itemId: string) =>
      auth.apiFetch(`/api/collections/${collectionId}/items/${itemId}`, {
        method: 'DELETE',
      }),
  }
}
