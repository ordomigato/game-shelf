import type { CollectionSummary } from '#shared/types/collection'

/**
 * The signed-in user's collections for the sidebar, shared by every
 * component. `null` until the first load. Anything that adds, removes or
 * renames collections, or changes what's in them, calls `refresh`.
 */
export function useMyCollections() {
  const auth = useAuth()
  const list = useState<CollectionSummary[] | null>(
    'my-collections',
    () => null,
  )

  async function refresh() {
    try {
      list.value = await auth.apiFetch<CollectionSummary[]>('/api/collections')
    } catch {
      // The sidebar keeps what it had; the pages show their own errors.
      list.value ??= []
    }
  }

  return { list, refresh }
}
