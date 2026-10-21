import { useDebounceFn } from '@vueuse/core'
import type { GameSearchResponse, GameSummary } from '#shared/types/game'

export const MIN_SEARCH_LENGTH = 2
const DEBOUNCE_MS = 300

/** Search filters, as IGDB ids and years. Null means not filtered. */
export interface SearchFilterState {
  platform: number | null
  genre: number | null
  from: number | null
  until: number | null
}

/** A positive whole number from the URL, or null. */
function queryNumber(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(number) && number > 0 ? number : null
}

/**
 * Search-as-you-type over `/api/games/search`. `input` is bound to the text
 * field. The search runs 300 ms after typing stops (or at once through
 * `searchNow`), and only for 2+ characters. A newer search cancels an older
 * one still in flight. The search term is kept in the URL as `?q=`, and
 * filters as `?platform=`, `?genre=`, `?from=` and `?until=`, so a shared link
 * or a reload shows the same results, rendered on the server.
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

  const filters = ref<SearchFilterState>({
    platform: queryNumber(route.query.platform),
    genre: queryNumber(route.query.genre),
    from: queryNumber(route.query.from),
    until: queryNumber(route.query.until),
  })
  /** The filters that are set, as the API and the URL take them. */
  const filterQuery = computed(() => {
    const query: Record<string, string> = {}
    for (const [key, value] of Object.entries(filters.value)) {
      if (value !== null) query[key] = String(value)
    }
    return query
  })
  const activeFilters = computed(() => Object.keys(filterQuery.value).length)

  watch(filterQuery, (value) => {
    const {
      platform: _p,
      genre: _g,
      from: _f,
      until: _u,
      ...rest
    } = route.query
    void router.replace({ query: { ...rest, ...value } })
  })

  const hasTerm = computed(() => term.value.length >= MIN_SEARCH_LENGTH)
  /** With filters set, search works without a term: it browses. */
  const isSearchable = computed(() => hasTerm.value || activeFilters.value > 0)
  const isBrowsing = computed(() => isSearchable.value && !hasTerm.value)
  /** What the API is asked: the term (when there is one) and the filters. */
  const apiQuery = computed(() => ({
    ...(hasTerm.value && { q: term.value }),
    ...filterQuery.value,
  }))

  // The request's own fetch: while rendering on the server it passes the
  // visitor's headers on, which the origin check and request limits need.
  const requestFetch = useRequestFetch()
  const { data, status, refresh } = useAsyncData(
    'game-search',
    async (_nuxtApp, { signal }) => {
      if (!isSearchable.value) return null
      return requestFetch<GameSearchResponse>('/api/games/search', {
        query: apiQuery.value,
        signal,
      })
    },
    { watch: [apiQuery] },
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
    const searched = apiQuery.value
    try {
      const response = await $fetch<GameSearchResponse>('/api/games/search', {
        query: { ...searched, page: current.page + 1 },
      })
      if (searched !== apiQuery.value) return
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
    filters,
    activeFilters,
    searchNow,
    isSearchable,
    isBrowsing,
    status,
    games,
    hasMore,
    loadingMore,
    loadMoreFailed,
    loadMore,
    retry: refresh,
  }
}
