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
      input: { title: string; description: string | null } & (
        { starter: StarterBlueprint } | { blueprintId: string; copy?: boolean }
      ),
    ) =>
      auth.apiFetch<CollectionSummary>('/api/collections', {
        method: 'POST',
        body: input,
      }),

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
        visibility?: CollectionVisibility
      },
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
      auth.apiFetch<{ item: LibraryItem; collectionIds: string[] }>(
        '/api/library-items',
        { method: 'POST', body: { ...game, collectionIds } },
      ),

    /** Adds a game IGDB doesn't have, by name, to one collection. */
    addManualGame: (name: string, collectionId: string) =>
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

    addItem: (collectionId: string, itemId: string) =>
      auth.apiFetch(`/api/collections/${collectionId}/items/${itemId}`, {
        method: 'PUT',
      }),

    /** Renames the user's own copy of a game, in all their collections. */
    renameItem: (itemId: string, name: string) =>
      auth.apiFetch<LibraryItem>(`/api/library-items/${itemId}`, {
        method: 'PATCH',
        body: { name },
      }),

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
      auth.apiFetch(
        `/api/collections/${fromCollectionId}/items/${itemId}/move`,
        { method: 'POST', body: { toCollectionIds } },
      ),

    removeItem: (collectionId: string, itemId: string) =>
      auth.apiFetch(`/api/collections/${collectionId}/items/${itemId}`, {
        method: 'DELETE',
      }),
  }
}
