<script setup lang="ts">
import type { SearchFilterOptions } from '#shared/types/game'
import { FILTER_YEAR_RANGE } from '#shared/utils/search-filters'
import type { SearchFilterState } from '~/composables/useGameSearch'

/**
 * Narrows search to a platform, a genre and a range of release years. The
 * platform and genre lists come from IGDB, loaded when the panel is shown.
 * A year applies once it's a whole year in range, when the field is left
 * or Enter is pressed.
 */
const filters = defineModel<SearchFilterState>({ required: true })

const ANY = 'any'
const ids = {
  platform: useId(),
  genre: useId(),
  from: useId(),
  until: useId(),
}

const options = useState<SearchFilterOptions | null>(
  'search-filter-options',
  () => null,
)
const failed = ref(false)
onMounted(async () => {
  if (options.value) return
  try {
    options.value = await $fetch<SearchFilterOptions>('/api/games/filters')
  } catch (error) {
    console.error(error)
    failed.value = true
  }
})

function chooseFilter(which: 'platform' | 'genre', value: unknown) {
  const id = value === ANY ? null : Number(value)
  filters.value = {
    ...filters.value,
    [which]: Number.isInteger(id) ? id : null,
  }
}

// What's typed in the year fields, applied on change.
const fromText = ref(filters.value.from?.toString() ?? '')
const toText = ref(filters.value.until?.toString() ?? '')
watch(
  () => [filters.value.from, filters.value.until],
  ([from, to]) => {
    fromText.value = from?.toString() ?? ''
    toText.value = to?.toString() ?? ''
  },
)

function parseYear(text: string): number | null | undefined {
  if (text.trim() === '') return null
  const year = Number(text)
  const valid =
    Number.isInteger(year) &&
    year >= FILTER_YEAR_RANGE.min &&
    year <= FILTER_YEAR_RANGE.max
  return valid ? year : undefined
}

function applyYears() {
  let from = parseYear(fromText.value)
  let to = parseYear(toText.value)
  // A year that isn't one keeps the last good value.
  if (from === undefined) from = filters.value.from
  if (to === undefined) to = filters.value.until
  // Typed the wrong way round: swap rather than find nothing.
  if (from !== null && to !== null && from > to) [from, to] = [to, from]
  fromText.value = from?.toString() ?? ''
  toText.value = to?.toString() ?? ''
  if (from !== filters.value.from || to !== filters.value.until) {
    filters.value = { ...filters.value, from, until: to }
  }
}

function clear() {
  filters.value = { platform: null, genre: null, from: null, until: null }
}

const isFiltered = computed(() =>
  Object.values(filters.value).some((value) => value !== null),
)
</script>

<template>
  <div
    class="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 text-left sm:grid-cols-[1fr_1fr_auto_auto_auto] sm:items-end"
  >
    <div class="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
      <Label :for="ids.platform">{{ $t('search.filters.platform') }}</Label>
      <Select
        :model-value="filters.platform?.toString() ?? ANY"
        :disabled="!options"
        @update:model-value="chooseFilter('platform', $event)"
      >
        <SelectTrigger :id="ids.platform" class="w-full">
          <SelectValue :placeholder="$t('search.filters.anyPlatform')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ANY">
            {{ $t('search.filters.anyPlatform') }}
          </SelectItem>
          <SelectItem
            v-for="platform in options?.platforms ?? []"
            :key="platform.id"
            :value="String(platform.id)"
          >
            {{ platform.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
      <Label :for="ids.genre">{{ $t('search.filters.genre') }}</Label>
      <Select
        :model-value="filters.genre?.toString() ?? ANY"
        :disabled="!options"
        @update:model-value="chooseFilter('genre', $event)"
      >
        <SelectTrigger :id="ids.genre" class="w-full">
          <SelectValue :placeholder="$t('search.filters.anyGenre')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ANY">
            {{ $t('search.filters.anyGenre') }}
          </SelectItem>
          <SelectItem
            v-for="genre in options?.genres ?? []"
            :key="genre.id"
            :value="String(genre.id)"
          >
            {{ genre.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label :for="ids.from">{{ $t('search.filters.from') }}</Label>
      <Input
        :id="ids.from"
        v-model="fromText"
        inputmode="numeric"
        :placeholder="$t('search.filters.yearPlaceholder')"
        class="sm:w-24"
        @change="applyYears"
        @keydown.enter.prevent="applyYears"
      />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label :for="ids.until">{{ $t('search.filters.to') }}</Label>
      <Input
        :id="ids.until"
        v-model="toText"
        inputmode="numeric"
        :placeholder="$t('search.filters.yearPlaceholder')"
        class="sm:w-24"
        @change="applyYears"
        @keydown.enter.prevent="applyYears"
      />
    </div>
    <Button
      type="button"
      variant="ghost"
      class="col-span-2 sm:col-span-1"
      :disabled="!isFiltered"
      @click="clear"
    >
      {{ $t('search.filters.clear') }}
    </Button>
    <p v-if="failed" class="col-span-full text-sm text-muted-foreground">
      {{ $t('search.filters.loadFailed') }}
    </p>
  </div>
</template>
