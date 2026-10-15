import { ofetch } from 'ofetch'
import type { ChartWidget } from '#shared/types/charts'
import type {
  Blueprint,
  BlueprintDetail,
  BlueprintImpact,
  CollectionDetail,
  CollectionSummary,
  CollectionVisibility,
  FieldDefinition,
  BlueprintSummary,
  FieldValue,
  LibraryItem,
} from '#shared/types/collection'
import type { PublicProfile } from '#shared/types/user'
import type { GameMembership } from '~/composables/useGameMemberships'
import type { StarterBlueprint } from '#shared/utils/starter-blueprints'

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

    /** What anyone can see about a user. */
    profile: (username: string) =>
      ofetch<PublicProfile>(`/api/u/${encodeURIComponent(username)}`),

    list: (username: string) =>
      viewerFetch<CollectionSummary[]>(userPath(username)),

    get: (username: string, slug: string) =>
      viewerFetch<CollectionDetail>(
        `${userPath(username)}/${encodeURIComponent(slug)}`,
      ),

    /** Starts from a copy of a starter's fields, or uses a blueprint. */
    create: (
      input: {
        title: string
        description: string | null
        color?: string | null
      } & (
        { starter: StarterBlueprint } | { blueprintId: string; copy?: boolean }
      ),
    ) =>
      refreshing(
        auth.apiFetch<CollectionSummary>('/api/collections', {
          method: 'POST',
          body: input,
        }),
      ),

    /** The signed-in user's blueprints. */
    blueprints: () => auth.apiFetch<BlueprintSummary[]>('/api/blueprints'),

    /** Saves a collection's fields as a named set. 409 if the name is taken. */
    saveBlueprint: (collectionId: string, name: string) =>
      auth.apiFetch<Blueprint>(
        `/api/collections/${collectionId}/blueprint/share`,
        { method: 'POST', body: { name } },
      ),

    /** Gives a collection its own copy of the set it uses. */
    detachBlueprint: (collectionId: string) =>
      auth.apiFetch<Blueprint>(
        `/api/collections/${collectionId}/blueprint/detach`,
        { method: 'POST' },
      ),

    /** One blueprint with the collections that use it. */
    getBlueprint: (id: string) =>
      auth.apiFetch<BlueprintDetail>(`/api/blueprints/${id}`),

    /** Renames a blueprint. 409 if the name is taken. */
    renameBlueprint: (id: string, name: string) =>
      auth.apiFetch<Blueprint>(`/api/blueprints/${id}`, {
        method: 'PATCH',
        body: { name },
      }),

    /** Deletes a blueprint no collection uses. 409 while one does. */
    deleteBlueprint: (id: string) =>
      auth.apiFetch(`/api/blueprints/${id}`, { method: 'DELETE' }),

    /** What saving these fields on a blueprint would change. */
    previewBlueprintFields: (
      id: string,
      fields: FieldDefinition[],
      optionRenames: Record<string, Record<string, string>>,
    ) =>
      auth.apiFetch<BlueprintImpact>(`/api/blueprints/${id}/preview`, {
        method: 'POST',
        body: { fields, optionRenames },
      }),

    /** Replaces a blueprint's fields, for every collection using it. */
    updateBlueprintFields: (
      id: string,
      fields: FieldDefinition[],
      optionRenames: Record<string, Record<string, string>>,
    ) =>
      auth.apiFetch<Blueprint>(`/api/blueprints/${id}/fields`, {
        method: 'PUT',
        body: { fields, optionRenames },
      }),

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
     * Of these IGDB games, the ones already in a collection (any of the
     * user's, or only `collectionId`), with their item ids.
     */
    tracked: (igdbIds: number[], collectionId?: string) =>
      auth.apiFetch<{ igdbId: number; itemId: string }[]>(
        '/api/library-items/igdb',
        {
          query: {
            ids: igdbIds.join(','),
            collection: collectionId,
          },
        },
      ),

    /** Adds an IGDB game to the library (once) and to these collections. */
    addGame: (
      game: { igdbId: number; name: string; coverId: string | null },
      collectionIds: string[],
    ) =>
      refreshing(
        remembering(
          auth.apiFetch<{ item: LibraryItem; collectionIds: string[] }>(
            '/api/library-items',
            { method: 'POST', body: { ...game, collectionIds } },
          ),
          (added) => memberships.set(game.igdbId, added),
          () => memberships.forgetGame(game.igdbId),
        ),
      ),

    /** Adds a game IGDB doesn't have, by name, to one collection. */
    addManualGame: (name: string, collectionId: string) =>
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
                collectionIds: [collectionId],
              },
            },
          ),
          memberships.clear,
        ),
      ),

    /**
     * Puts an item in a collection (and in Owned, for a custom collection).
     * Resolves with the collections it's in.
     */
    addItem: (collectionId: string, itemId: string) =>
      refreshing(
        remembering(
          auth.apiFetch<{ collectionIds: string[] }>(
            `/api/collections/${collectionId}/items/${itemId}`,
            { method: 'PUT' },
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

    /** Replaces a collection's fields. Stored values are carried over. */
    updateFields: (
      collectionId: string,
      fields: FieldDefinition[],
      optionRenames: Record<string, Record<string, string>>,
    ) =>
      auth.apiFetch<Blueprint>(`/api/collections/${collectionId}/fields`, {
        method: 'PUT',
        body: { fields, optionRenames },
      }),

    /** Sets an item's values for a collection's fields. `null` clears. */
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

    /** Moves a game out of one collection into others, like "Got it". */
    moveToCollections: (
      fromCollectionId: string,
      itemId: string,
      toCollectionIds: string[],
    ) =>
      refreshing(
        remembering(
          auth.apiFetch(
            `/api/collections/${fromCollectionId}/items/${itemId}/move`,
            { method: 'POST', body: { toCollectionIds } },
          ),
          () => memberships.forgetItem(itemId),
          () => memberships.forgetItem(itemId),
        ),
      ),

    /**
     * Takes an item out of a collection. Out of Owned, it leaves every
     * custom collection too. Resolves with the collections it's still in.
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
