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

  // Pages fetched by "Show more". Everything shown is derived from `data`
  // plus these, never set in a watcher, so the server render and the
  // browser's first render agree.
  const morePages = ref<GameSearchResponse[]>([])
  const loadingMore = ref(false)
  const loadMoreFailed = ref(false)

  watch(data, () => {
    morePages.value = []
    loadMoreFailed.value = false
  })

  const latestPage = computed(() => morePages.value.at(-1) ?? data.value)
  const hasMore = computed(() => latestPage.value?.hasMore ?? false)

  async function loadMore() {
    const current = latestPage.value
    if (!current?.hasMore || loadingMore.value) return
    loadingMore.value = true
    loadMoreFailed.value = false
    const searchedTerm = term.value
    try {
      const response = await $fetch<GameSearchResponse>('/api/games/search', {
        query: { q: searchedTerm, page: current.page + 1 },
      })
      if (searchedTerm !== term.value) return
      morePages.value.push(response)
    } catch (error) {
      console.error(error)
      loadMoreFailed.value = true
    } finally {
      loadingMore.value = false
    }
  }

  const games = computed<GameSummary[]>(() => [
    ...(data.value?.games ?? []),
    ...morePages.value.flatMap((page) => page.games),
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
