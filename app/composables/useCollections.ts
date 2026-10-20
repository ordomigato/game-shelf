import { ofetch } from 'ofetch'
import type { NitroFetchOptions, NitroFetchRequest } from 'nitropack'
import type { ChartWidget } from '#shared/types/charts'
import type {
  CollectionDetail,
  CollectionSummary,
  CollectionVisibility,
  FieldValue,
  LibraryItem,
  ListDetail,
  ListName,
  CollectionLink,
} from '#shared/types/collection'
import type { ListAction } from '#shared/utils/lists'
import { viewToQuery, type ListView } from '#shared/utils/list-view'
import type { PublicProfile } from '#shared/types/user'
import type { GameMembership } from '~/composables/useGameMemberships'

/**
 * Reading and changing collections. Reads send the access token when signed
 * in, so the server can tell the owner (who sees everything) from visitors
 * (public collections only).
 */
export function useCollections() {
  const auth = useAuth()
  const sidebar = useMyCollections()
  const memberships = useGameMemberships()

  /** Refreshes the sidebar's collections once a change has saved. */
  function refreshing<T>(request: Promise<T>): Promise<T> {
    return request.then((result) => {
      void sidebar.refresh()
      return result
    })
  }

  /**
   * Keeps the games' remembered collections right after a change: `saved`
   * records a change that worked, and `failed` drops what it could have
   * touched, since the server may have made part of it.
   */
  function remembering<T>(
    request: Promise<T>,
    saved: (result: T) => void,
    failed: () => void = memberships.clear,
  ): Promise<T> {
    return request.then(
      (result) => {
        saved(result)
        return result
      },
      (error: unknown) => {
        failed()
        throw error
      },
    )
  }

  async function viewerFetch<T>(
    url: string,
    options: NitroFetchOptions<NitroFetchRequest> = {},
  ): Promise<T> {
    await auth.ensureLoaded()
    return auth.status.value === 'signedIn'
      ? auth.apiFetch<T>(url, options)
      : (ofetch<T>(url, options as object) as Promise<T>)
  }

  const userPath = (username: string) =>
    `/api/u/${encodeURIComponent(username)}/collections`

  return {
    /** Whether `username` is the signed-in user. */
    isMine: (username: string) =>
      auth.me.value?.username === username.toLowerCase(),

    /** What anyone can see about a user. */
    profile: (username: string) =>
      ofetch<PublicProfile>(`/api/u/${encodeURIComponent(username)}`),

    list: (username: string) =>
      viewerFetch<CollectionSummary[]>(userPath(username)),

    get: (username: string, slug: string) =>
      viewerFetch<CollectionDetail>(
        `${userPath(username)}/${encodeURIComponent(slug)}`,
      ),

    /**
     * One page of Owned or the Wishlist, sorted, searched and filtered by
     * the server. Only its owner can read them (404). `signal` cancels the
     * request when a newer one replaces it.
     */
    getList: (
      username: string,
      list: ListName,
      view: ListView,
      signal?: AbortSignal,
    ) =>
      viewerFetch<ListDetail>(
        `/api/u/${encodeURIComponent(username)}/lists/${list}`,
        { query: viewToQuery(view, { withSize: true }), signal },
      ),

    /** The whole of Owned or the Wishlist as a CSV file. */
    exportList: (list: ListName) =>
      auth.apiFetch<Blob>(`/api/lists/${list}/export`, {
        responseType: 'blob',
      }),

    /** Sets a game's values for the user's fields, from a list. `null` clears. */
    updateItemValues: (
      itemId: string,
      values: Record<string, FieldValue | null>,
    ) =>
      auth.apiFetch<LibraryItem>(`/api/library-items/${itemId}/values`, {
        method: 'PATCH',
        body: { values },
      }),

    create: (input: {
      title: string
      description: string | null
      color?: string | null
    }) =>
      refreshing(
        auth.apiFetch<CollectionSummary>('/api/collections', {
          method: 'POST',
          body: input,
        }),
      ),

    update: (
      id: string,
      changes: {
        title?: string
        description?: string | null
        color?: string | null
        visibility?: CollectionVisibility
      },
    ) =>
      refreshing(
        auth.apiFetch<CollectionSummary>(`/api/collections/${id}`, {
          method: 'PATCH',
          body: changes,
        }),
      ),

    remove: (id: string) =>
      refreshing(
        remembering(
          auth.apiFetch(`/api/collections/${id}`, { method: 'DELETE' }),
          memberships.clear,
        ),
      ),

    /**
     * The user's item for an IGDB game, if any, and its collections. Asked
     * once per game until the page reloads.
     */
    membership: (igdbId: number) =>
      memberships.get(igdbId, () =>
        auth.apiFetch<GameMembership>(`/api/library-items/igdb/${igdbId}`),
      ),

    /**
     * Of these IGDB games, the ones the user already has, with their item
     * ids: on a list, or only those in `collectionId` or on `list`.
     */
    tracked: (
      igdbIds: number[],
      only: { collectionId?: string; list?: ListName } = {},
    ) =>
      auth.apiFetch<{ igdbId: number; itemId: string }[]>(
        '/api/library-items/igdb',
        {
          query: {
            ids: igdbIds.join(','),
            collection: only.collectionId,
            list: only.list,
          },
        },
      ),

    /**
     * Adds an IGDB game to the library (once) and to these collections. A
     * new game is owned, or wishlisted with `list`, optionally on named
     * platforms. A game already there keeps its lists unless `list` is set.
     */
    addGame: (
      game: { igdbId: number; name: string; coverId: string | null },
      collectionIds: string[],
      lists: { list?: ListName; platforms?: number[] } = {},
    ) =>
      refreshing(
        remembering(
          auth.apiFetch<{ item: LibraryItem; collectionIds: string[] }>(
            '/api/library-items',
            { method: 'POST', body: { ...game, collectionIds, ...lists } },
          ),
          (added) => memberships.set(game.igdbId, added),
          () => memberships.forgetGame(game.igdbId),
        ),
      ),

    /** Adds a game IGDB doesn't have, by name, to a collection or a list. */
    addManualGame: (
      name: string,
      target: { collectionId: string } | { list: ListName },
    ) =>
      refreshing(
        remembering(
          auth.apiFetch<{ item: LibraryItem; collectionIds: string[] }>(
            '/api/library-items',
            {
              method: 'POST',
              body: {
                igdbId: null,
                name,
                coverId: null,
                collectionIds:
                  'collectionId' in target ? [target.collectionId] : [],
                ...('list' in target && { list: target.list }),
              },
            },
          ),
          memberships.clear,
        ),
      ),

    /**
     * Changes a game's place on Owned and the Wishlist. Resolves with its
     * new state (null when it was on neither list and got deleted).
     */
    changeLists: (itemId: string, action: ListAction) =>
      refreshing(
        remembering(
          auth.apiFetch<{ item: LibraryItem | null; collectionIds: string[] }>(
            `/api/library-items/${itemId}/lists`,
            { method: 'PUT', body: action },
          ),
          (saved) =>
            memberships.setItem(itemId, saved.item, saved.collectionIds),
          () => memberships.forgetItem(itemId),
        ),
      ),

    /**
     * The collections a game is in, from the server, for the question
     * before taking it off its last list.
     */
    itemCollections: (itemId: string) =>
      auth.apiFetch<CollectionLink[]>(
        `/api/library-items/${itemId}/collections`,
      ),

    /**
     * Puts a game in the collections `add` and takes it out of `remove`,
     * leaving its others alone. Resolves with every collection it's in.
     */
    setItemCollections: (
      itemId: string,
      change: { add: string[]; remove: string[] },
    ) =>
      refreshing(
        remembering(
          auth.apiFetch<{ collectionIds: string[] }>(
            `/api/library-items/${itemId}/collections`,
            { method: 'PUT', body: change },
          ),
          (saved) => memberships.setCollections(itemId, saved.collectionIds),
          () => memberships.forgetItem(itemId),
        ),
      ),

    /** Renames a game added by hand, in all the user's collections. */
    renameItem: (itemId: string, name: string) =>
      auth.apiFetch<LibraryItem>(`/api/library-items/${itemId}`, {
        method: 'PATCH',
        body: { name },
      }),

    /** Everything the user has, as CSV files in a zip. */
    exportEverything: () =>
      auth.apiFetch<Blob>('/api/export', { responseType: 'blob' }),

    /** Replaces the charts on a collection's dashboard. */
    saveDashboard: (collectionId: string, dashboard: ChartWidget[]) =>
      auth.apiFetch<ChartWidget[]>(
        `/api/collections/${collectionId}/dashboard`,
        { method: 'PUT', body: { dashboard } },
      ),

    /** Saves the columns hidden in a collection's table. */
    saveHiddenColumns: (collectionId: string, hiddenColumns: string[]) =>
      auth.apiFetch<CollectionSummary>(`/api/collections/${collectionId}`, {
        method: 'PATCH',
        body: { hiddenColumns },
      }),

    /** Saves the columns hidden on Owned or the Wishlist. */
    saveListColumns: (list: ListName, hidden: string[]) =>
      auth.apiFetch<string[]>(`/api/me/list-columns/${list}`, {
        method: 'PUT',
        body: { hidden },
      }),

    /** Sets an item's values for the user's fields. `null` clears. */
    updateValues: (
      collectionId: string,
      itemId: string,
      values: Record<string, FieldValue | null>,
    ) =>
      auth.apiFetch<LibraryItem>(
        `/api/collections/${collectionId}/items/${itemId}`,
        { method: 'PATCH', body: { values } },
      ),

    /** Moves an item to just after another in a collection (first if null). */
    moveItem: (
      collectionId: string,
      itemId: string,
      afterItemId: string | null,
    ) =>
      auth.apiFetch(
        `/api/collections/${collectionId}/items/${itemId}/position`,
        { method: 'PUT', body: { afterItemId } },
      ),

    /**
     * Takes an item out of a collection. Resolves with the collections it's
     * still in.
     */
    removeItem: (collectionId: string, itemId: string) =>
      refreshing(
        remembering(
          auth.apiFetch<{ collectionIds: string[] }>(
            `/api/collections/${collectionId}/items/${itemId}`,
            { method: 'DELETE' },
          ),
          (saved) => memberships.setCollections(itemId, saved.collectionIds),
          () => memberships.forgetItem(itemId),
        ),
      ),
  }
}
