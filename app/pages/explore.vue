<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { ExploreCollection, ExplorePage } from '#shared/types/collection'

/**
 * Everyone's public collections, most recently active first. Rendered on
 * the server, since it's the same for everyone.
 */
const { t } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('explore.title') }) }))
useSeoMeta({
  description: () => t('explore.description'),
  ogSiteName: 'GameShelf',
  ogType: 'website',
  ogTitle: () => t('app.title', { page: t('explore.title') }),
  ogDescription: () => t('explore.description'),
  twitterCard: 'summary',
})

// Nuxt's $fetch, which also works while rendering on the server (a plain
// fetch can't resolve "/api/…" there). Typed by hand: inferring the route's
// type here is too deep for TypeScript.
const fetchPage = (page: number) =>
  $fetch<ExplorePage>('/api/explore' as string, { query: { page } })

const { data, status, error, refresh } = useAsyncData('explore', () =>
  fetchPage(1),
)

const more = ref<ExploreCollection[]>([])
const page = ref(1)
const hasMore = ref(false)
const loadingMore = ref(false)
watch(
  data,
  (first) => {
    more.value = []
    page.value = 1
    hasMore.value = first?.hasMore ?? false
  },
  { immediate: true },
)
const collections = computed(() => [
  ...(data.value?.collections ?? []),
  ...more.value,
])

async function loadMore() {
  loadingMore.value = true
  try {
    const next = await fetchPage(page.value + 1)
    page.value += 1
    more.value = [...more.value, ...next.collections]
    hasMore.value = next.hasMore
  } catch {
    toast.error(t('explore.loadMoreFailed'))
  } finally {
    loadingMore.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="text-3xl font-bold">{{ $t('explore.title') }}</h1>
      <p class="mt-1 text-muted-foreground">
        {{ $t('explore.description') }}
      </p>
    </div>

    <div
      v-if="status === 'pending' && !data"
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
    >
      <Skeleton v-for="n in 6" :key="n" class="h-48 rounded-lg" />
    </div>

    <div v-else-if="error" class="py-12 text-center">
      <p class="text-lg font-medium">{{ $t('explore.loadFailed') }}</p>
      <Button class="mt-4" @click="refresh()">{{ $t('shelf.retry') }}</Button>
    </div>

    <p
      v-else-if="!collections.length"
      class="rounded-lg border border-dashed py-12 text-center text-muted-foreground"
    >
      {{ $t('explore.empty') }}
    </p>

    <template v-else>
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="collection in collections" :key="collection.id">
          <ExploreCard :collection="collection" />
        </li>
      </ul>
      <div v-if="hasMore" class="text-center">
        <Button variant="outline" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? $t('search.loadingMore') : $t('search.showMore') }}
        </Button>
      </div>
    </template>
  </div>
</template>
