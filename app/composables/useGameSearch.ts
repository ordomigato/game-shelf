import { useDebounceFn } from '@vueuse/core'
import type { GameSearchResponse, GameSummary } from '#shared/types/game'

export const MIN_SEARCH_LENGTH = 2
const DEBOUNCE_MS = 300

/**
 * Search-as-you-type over `/api/games/search`. `input` is bound to the text
 * field. The search runs 300 ms after typing stops (or at once through
 * `searchNow`), and only for 2+ characters. A newer search cancels an older
 * one still in flight. The search term is kept in the URL as `?q=`, so a
 * shared link or a reload shows the same results, rendered on the server.
 */
export function useGameSearch() {
  const route = useRoute()
  const router = useRouter()

  const initial = typeof route.query.q === 'string' ? route.query.q : ''
  const input = ref(initial)
  const term = ref(initial.trim())

  const commit = (value: string) => {
    term.value = value.trim()
  }
  const debouncedCommit = useDebounceFn(commit, DEBOUNCE_MS)
  watch(input, (value) => {
    void debouncedCommit(value)
  })

  function searchNow() {
    commit(input.value)
  }

  watch(term, (value) => {
    void router.replace({ query: { ...route.query, q: value || undefined } })
  })

  const isSearchable = computed(() => term.value.length >= MIN_SEARCH_LENGTH)

  const { data, status, refresh } = useAsyncData(
    'game-search',
    async (_nuxtApp, { signal }) => {
      if (!isSearchable.value) return null
      return $fetch<GameSearchResponse>('/api/games/search', {
        query: { q: term.value },
        signal,
      })
    },
    { watch: [term] },
  )

  const extraGames = ref<GameSummary[]>([])
  const lastPage = ref(1)
  const hasMore = ref(false)
  const loadingMore = ref(false)
  const loadMoreFailed = ref(false)

  watch(
    data,
    (response) => {
      extraGames.value = []
      lastPage.value = response?.page ?? 1
      hasMore.value = response?.hasMore ?? false
      loadMoreFailed.value = false
    },
    { immediate: true },
  )

  async function loadMore() {
    if (!hasMore.value || loadingMore.value) return
    loadingMore.value = true
    loadMoreFailed.value = false
    const searchedTerm = term.value
    try {
      const response = await $fetch<GameSearchResponse>('/api/games/search', {
        query: { q: searchedTerm, page: lastPage.value + 1 },
      })
      if (searchedTerm !== term.value) return
      extraGames.value.push(...response.games)
      lastPage.value = response.page
      hasMore.value = response.hasMore
    } catch (error) {
      console.error(error)
      loadMoreFailed.value = true
    } finally {
      loadingMore.value = false
    }
  }

  const games = computed(() => [
    ...(data.value?.games ?? []),
    ...extraGames.value,
  ])

  return {
    input,
    term,
    searchNow,
    isSearchable,
    status,
    games,
    hasMore,
    loadingMore,
    loadMoreFailed,
    loadMore,
    retry: refresh,
  }
}
