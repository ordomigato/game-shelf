<script setup lang="ts">
import { Search } from '@lucide/vue'

const {
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
  retry,
} = useGameSearch()

const showSkeletons = computed(
  () => isSearchable.value && status.value === 'pending' && !games.value.length,
)
const showTooShort = computed(
  () =>
    input.value.trim().length > 0 &&
    input.value.trim().length < MIN_SEARCH_LENGTH,
)
const resultsLabel = computed(() => {
  if (!isSearchable.value || status.value !== 'success') return ''
  if (!games.value.length) return `No games found for ${term.value}`
  return `${games.value.length} games found`
})
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-2xl text-center transition-[padding]"
      :class="isSearchable ? 'pt-2 pb-8' : 'py-16'"
    >
      <h1 class="text-4xl font-bold sm:text-5xl">Find any game</h1>
      <p class="mt-3 text-lg text-muted-foreground">
        Search thousands of games, then add them to your shelf.
      </p>
      <form class="relative mt-8" role="search" @submit.prevent="searchNow">
        <Search
          class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          v-model="input"
          type="search"
          aria-label="Search games"
          placeholder="Search games, like Zelda or Hades"
          autocomplete="off"
          autofocus
          class="h-14 bg-card pl-12 text-lg md:text-lg"
        />
      </form>
      <p v-if="showTooShort" class="mt-3 text-sm text-muted-foreground">
        Type at least {{ MIN_SEARCH_LENGTH }} characters.
      </p>
    </section>

    <p class="sr-only" aria-live="polite">{{ resultsLabel }}</p>

    <div
      v-if="showSkeletons"
      class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      aria-hidden="true"
    >
      <div v-for="n in 12" :key="n" class="flex flex-col gap-2">
        <Skeleton class="aspect-[3/4] w-full rounded-md" />
        <Skeleton class="h-4 w-3/4" />
        <Skeleton class="h-3 w-1/2" />
      </div>
    </div>

    <div
      v-else-if="isSearchable && status === 'error'"
      class="py-12 text-center"
    >
      <p class="text-lg font-medium">Search isn't working right now.</p>
      <p class="mt-1 text-muted-foreground">Try again in a moment.</p>
      <Button class="mt-6" @click="retry()">Try again</Button>
    </div>

    <div
      v-else-if="isSearchable && status === 'success' && !games.length"
      class="py-12 text-center"
    >
      <p class="text-lg font-medium">No games found for "{{ term }}".</p>
      <p class="mt-1 text-muted-foreground">
        Check the spelling, or try fewer words.
      </p>
    </div>

    <template v-else-if="games.length">
      <ul
        class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
        :class="{ 'opacity-60 transition-opacity': status === 'pending' }"
      >
        <li v-for="game in games" :key="game.id">
          <GameCard :game="game" />
        </li>
      </ul>
      <div v-if="hasMore" class="mt-10 text-center">
        <Button variant="outline" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading…' : 'Show more' }}
        </Button>
        <p v-if="loadMoreFailed" class="mt-2 text-sm text-muted-foreground">
          Couldn't load more games. Try again.
        </p>
      </div>
    </template>
  </div>
</template>
