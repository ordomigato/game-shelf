<script setup lang="ts">
import type { SearchFilterOptions } from '#shared/types/game'
import { FILTER_YEAR_RANGE } from '#shared/utils/search-filters'
import type { SearchFilterState } from '~/composables/useGameSearch'

/**
 * Search filters as a row of pills: platform, genre and release years.
 * Platform and genre open a list to search (IGDB has about 200 platforms);
 * years open decade buttons and exact years. The lists come from IGDB,
 * loaded once per visit.
 */
const filters = defineModel<SearchFilterState>({ required: true })

const { t } = useI18n()
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

const open = reactive({ platform: false, genre: false, years: false })

function set(changes: Partial<SearchFilterState>) {
  filters.value = { ...filters.value, ...changes }
}

function pickPlatform(id: number) {
  set({ platform: id })
  open.platform = false
}
function pickGenre(id: number) {
  set({ genre: id })
  open.genre = false
}

const nameOf = (
  list: { id: number; name: string }[] | undefined,
  id: number | null,
) =>
  id === null ? null : (list?.find((item) => item.id === id)?.name ?? `#${id}`)
const platformName = computed(() =>
  nameOf(options.value?.platforms, filters.value.platform),
)
const genreName = computed(() =>
  nameOf(options.value?.genres, filters.value.genre),
)

// Years: a decade in one click, or exact years.
const DECADES = [1970, 1980, 1990, 2000, 2010, 2020]
const isDecade = (decade: number) =>
  filters.value.from === decade && filters.value.until === decade + 9
function pickDecade(decade: number) {
  set({ from: decade, until: decade + 9 })
  open.years = false
}

const yearsLabel = computed(() => {
  const { from, until } = filters.value
  if (from && until) {
    if (from % 10 === 0 && until === from + 9) {
      return t('search.filters.decade', { decade: from })
    }
    return from === until ? String(from) : `${from}–${until}`
  }
  if (from) return t('search.filters.fromYear', { year: from })
  if (until) return t('search.filters.untilYear', { year: until })
  return null
})

const fromText = ref('')
const untilText = ref('')
watch(
  () => open.years,
  (isOpen) => {
    if (!isOpen) return
    fromText.value = filters.value.from?.toString() ?? ''
    untilText.value = filters.value.until?.toString() ?? ''
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
const yearProblem = ref(false)
function applyYears() {
  let from = parseYear(fromText.value)
  let until = parseYear(untilText.value)
  yearProblem.value = from === undefined || until === undefined
  if (from === undefined || until === undefined) return
  // Typed the wrong way round: swap rather than find nothing.
  if (from !== null && until !== null && from > until) {
    ;[from, until] = [until, from]
  }
  set({ from, until })
  open.years = false
}

const isFiltered = computed(() =>
  Object.values(filters.value).some((value) => value !== null),
)
function clear() {
  filters.value = { platform: null, genre: null, from: null, until: null }
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-center gap-2">
    <FilterChip
      v-model:open="open.platform"
      :label="$t('search.filters.platform')"
      :value="platformName"
      @clear="set({ platform: null })"
    >
      <FilterChoiceList
        :options="options?.platforms ?? []"
        :selected="filters.platform"
        :search-label="$t('search.filters.findPlatform')"
        @pick="pickPlatform"
      />
    </FilterChip>
    <FilterChip
      v-model:open="open.genre"
      :label="$t('search.filters.genre')"
      :value="genreName"
      @clear="set({ genre: null })"
    >
      <FilterChoiceList
        :options="options?.genres ?? []"
        :selected="filters.genre"
        :search-label="$t('search.filters.findGenre')"
        @pick="pickGenre"
      />
    </FilterChip>
    <FilterChip
      v-model:open="open.years"
      :label="$t('search.filters.years')"
      :value="yearsLabel"
      @clear="set({ from: null, until: null })"
    >
      <div class="flex flex-col gap-3 p-3">
        <div class="grid grid-cols-3 gap-1.5">
          <Button
            v-for="decade in DECADES"
            :key="decade"
            type="button"
            size="sm"
            :variant="isDecade(decade) ? 'default' : 'outline'"
            :aria-pressed="isDecade(decade)"
            @click="pickDecade(decade)"
          >
            {{ $t('search.filters.decade', { decade }) }}
          </Button>
        </div>
        <form class="flex flex-col gap-2" @submit.prevent="applyYears">
          <div class="flex items-end gap-2">
            <div class="flex flex-1 flex-col gap-1">
              <Label for="filter-from" class="text-xs">
                {{ $t('search.filters.from') }}
              </Label>
              <Input
                id="filter-from"
                v-model="fromText"
                inputmode="numeric"
                :placeholder="$t('search.filters.yearPlaceholder')"
                class="h-8"
              />
            </div>
            <div class="flex flex-1 flex-col gap-1">
              <Label for="filter-until" class="text-xs">
                {{ $t('search.filters.until') }}
              </Label>
              <Input
                id="filter-until"
                v-model="untilText"
                inputmode="numeric"
                :placeholder="$t('search.filters.yearPlaceholder')"
                class="h-8"
              />
            </div>
            <Button type="submit" size="sm">
              {{ $t('search.filters.apply') }}
            </Button>
          </div>
          <p v-if="yearProblem" class="text-xs text-destructive" role="alert">
            {{
              $t('search.filters.yearProblem', {
                min: FILTER_YEAR_RANGE.min,
                max: FILTER_YEAR_RANGE.max,
              })
            }}
          </p>
        </form>
      </div>
    </FilterChip>
    <button
      v-if="isFiltered"
      type="button"
      class="h-9 rounded-md px-2 text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      @click="clear"
    >
      {{ $t('search.filters.clear') }}
    </button>
    <p v-if="failed" class="w-full text-center text-sm text-muted-foreground">
      {{ $t('search.filters.loadFailed') }}
    </p>
  </div>
</template>
