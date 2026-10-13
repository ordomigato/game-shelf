<script setup lang="ts">
import { Gamepad2, LayoutGrid, Search, Table2 } from '@lucide/vue'

/**
 * Every game the user owns: in at least one collection other than the
 * Wishlist. Collections have different fields, so the table shows what they
 * share: the game, which collections it's in, and when it was added.
 */
definePageMeta({ middleware: 'auth' })

const { t, locale } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('ownedPage.title') }) }))

const NuxtLink = resolveComponent('NuxtLink')
const auth = useAuth()
const collections = useCollections()
const { data, status, error, refresh } = useAsyncData('owned', () =>
  collections.owned(),
)

const shelfPath = computed(() => `/u/${auth.me.value?.username ?? ''}/shelf`)
const dateFormat = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }),
)

// Table or covers, remembered on this device like a collection's view.
const VIEW_KEY = 'gameshelf:owned-view'
const view = ref<'table' | 'covers'>('table')
onMounted(() => {
  try {
    if (localStorage.getItem(VIEW_KEY) === 'covers') view.value = 'covers'
  } catch {
    // Storage can be blocked. The table is a fine default.
  }
})
function chooseView(value: unknown) {
  if (value !== 'table' && value !== 'covers') return
  view.value = value
  try {
    localStorage.setItem(VIEW_KEY, value)
  } catch {
    // Not remembered, which is fine.
  }
}

// Long lists grow by a batch at a time instead of drawing every row.
const BATCH = 60
const limit = ref(BATCH)

// Search by the game's name or a collection it's in. Every word typed has
// to match somewhere.
const query = ref('')
const matching = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return data.value ?? []
  return (data.value ?? []).filter((game) => {
    const text = [game.name, ...game.collections.map((c) => c.title)]
      .join(' ')
      .toLowerCase()
    return words.every((word) => text.includes(word))
  })
})
watch(query, () => (limit.value = BATCH))
const shown = computed(() => matching.value.slice(0, limit.value))
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
    <div>
      <h1 class="text-3xl font-bold">{{ $t('ownedPage.title') }}</h1>
      <p class="mt-1 text-muted-foreground">
        {{ $t('ownedPage.description') }}
      </p>
    </div>

    <div v-if="status === 'pending' && !data" class="flex flex-col gap-3">
      <Skeleton v-for="n in 5" :key="n" class="h-12 w-full" />
    </div>

    <div v-else-if="error" class="py-12 text-center">
      <p class="text-lg font-medium">{{ $t('ownedPage.loadFailed') }}</p>
      <Button class="mt-4" @click="refresh()">{{ $t('shelf.retry') }}</Button>
    </div>

    <div
      v-else-if="!data?.length"
      class="rounded-lg border border-dashed py-12 text-center"
    >
      <Gamepad2
        class="mx-auto size-8 text-muted-foreground"
        aria-hidden="true"
      />
      <p class="mt-3 font-medium">{{ $t('ownedPage.empty') }}</p>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ $t('ownedPage.emptyHint') }}
      </p>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div class="relative w-full sm:max-w-xs">
          <Search
            class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            v-model="query"
            type="search"
            :aria-label="$t('ownedPage.search')"
            :placeholder="$t('ownedPage.search')"
            class="pl-8"
          />
        </div>
        <p class="text-sm text-muted-foreground">
          {{
            query.trim()
              ? $t(
                  'ownedPage.matchCount',
                  { count: matching.length, total: data.length },
                  matching.length,
                )
              : $t('ownedPage.count', { count: data.length }, data.length)
          }}
        </p>
        <div class="flex-1" />
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          :model-value="view"
          :aria-label="$t('collection.view')"
          @update:model-value="chooseView"
        >
          <ToggleGroupItem value="table" :aria-label="$t('collection.table')">
            <Table2 aria-hidden="true" />
            <span class="hidden sm:inline">{{ $t('collection.table') }}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="covers" :aria-label="$t('collection.covers')">
            <LayoutGrid aria-hidden="true" />
            <span class="hidden sm:inline">{{ $t('collection.covers') }}</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <p
        v-if="!matching.length"
        class="rounded-lg border border-dashed py-12 text-center text-muted-foreground"
      >
        {{ $t('ownedPage.noMatches', { query: query.trim() }) }}
      </p>

      <div
        v-else-if="view === 'table'"
        class="overflow-x-auto rounded-lg border"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ $t('ownedPage.game') }}</TableHead>
              <TableHead>{{ $t('ownedPage.collections') }}</TableHead>
              <TableHead class="text-right">
                {{ $t('ownedPage.added') }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="game in shown" :key="game.id">
              <TableCell class="min-w-56">
                <component
                  :is="game.igdbId ? NuxtLink : 'div'"
                  :to="game.igdbId ? `/games/${game.igdbId}` : undefined"
                  class="flex items-center gap-3 rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :class="{ 'hover:underline': game.igdbId }"
                >
                  <GameCover
                    :name="game.name"
                    :cover-id="game.coverId"
                    size="thumb"
                    class="w-8 shrink-0"
                  />
                  <span class="line-clamp-2">{{ game.name }}</span>
                </component>
              </TableCell>
              <TableCell>
                <ul class="flex flex-wrap gap-1.5">
                  <li
                    v-for="collection in game.collections"
                    :key="collection.id"
                  >
                    <Badge as-child variant="secondary">
                      <NuxtLink :to="`${shelfPath}/${collection.slug}`">
                        <span
                          class="size-2 shrink-0 rounded-sm ring-1 ring-foreground/15 ring-inset"
                          :style="{ background: collectionColour(collection) }"
                          aria-hidden="true"
                        />
                        {{ collection.title }}
                      </NuxtLink>
                    </Badge>
                  </li>
                </ul>
              </TableCell>
              <TableCell
                class="text-right whitespace-nowrap text-muted-foreground tabular-nums"
              >
                {{ dateFormat.format(new Date(game.addedAt)) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <ul
        v-else
        class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      >
        <li v-for="game in shown" :key="game.id">
          <component
            :is="game.igdbId ? NuxtLink : 'div'"
            :to="game.igdbId ? `/games/${game.igdbId}` : undefined"
            class="group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <GameCover :name="game.name" :cover-id="game.coverId" />
            <span
              class="line-clamp-2 text-sm font-semibold"
              :class="{ 'group-hover:underline': game.igdbId }"
            >
              {{ game.name }}
            </span>
          </component>
        </li>
      </ul>

      <div v-if="matching.length > limit" class="text-center">
        <Button variant="outline" @click="limit += BATCH">
          {{ $t('collection.showMore') }}
        </Button>
      </div>
    </template>
  </div>
</template>
