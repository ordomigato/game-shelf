<script setup lang="ts">
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useVueTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from '@tanstack/vue-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ListFilter,
  Search,
  Trash2,
  X,
} from '@lucide/vue'
import type {
  CollectionEntry,
  FieldDefinition,
  FieldValue,
} from '#shared/types/collection'

/**
 * A collection's games as a table: one column per field in its blueprint.
 * Anyone can sort by a column, search, and filter by select and checkbox
 * fields. Owners edit values in place and remove games.
 */
const props = defineProps<{
  fields: FieldDefinition[]
  items: CollectionEntry[]
  editable: boolean
}>()
const emit = defineEmits<{
  save: [itemId: string, fieldId: string, value: FieldValue | null]
  remove: [itemId: string]
}>()

const { t, locale } = useI18n()
const NuxtLink = resolveComponent('NuxtLink')

// Search and filters

const query = ref('')
/** Field id to the values to keep: select options, or "yes"/"no". */
const filters = ref<Record<string, string[]>>({})

const filterableFields = computed(() =>
  props.fields.filter(
    (field) =>
      field.type === 'checkbox' ||
      (field.type === 'select' && field.options?.length),
  ),
)
const activeFilterCount = computed(
  () => Object.values(filters.value).filter((values) => values.length).length,
)

function filterChoices(field: FieldDefinition) {
  return field.type === 'checkbox'
    ? [
        { value: 'yes', label: t('table.ticked') },
        { value: 'no', label: t('table.notTicked') },
      ]
    : (field.options ?? []).map((option) => ({ value: option, label: option }))
}

function toggleFilter(fieldId: string, value: string, on: boolean) {
  const current = filters.value[fieldId] ?? []
  filters.value = {
    ...filters.value,
    [fieldId]: on
      ? [...current, value]
      : current.filter((existing) => existing !== value),
  }
}

function clearFilters() {
  query.value = ''
  filters.value = {}
}

function matchesFilters(item: CollectionEntry) {
  return props.fields.every((field) => {
    const wanted = filters.value[field.id]
    if (!wanted?.length) return true
    const value = item.data[field.id]
    if (field.type === 'checkbox') {
      return wanted.includes(value === true ? 'yes' : 'no')
    }
    return typeof value === 'string' && wanted.includes(value)
  })
}

function matchesQuery(item: CollectionEntry) {
  const words = query.value.trim().toLowerCase()
  if (!words) return true
  const haystack = [
    item.name,
    ...props.fields
      .filter((field) => field.type === 'text' || field.type === 'select')
      .map((field) => item.data[field.id] ?? ''),
  ]
    .join(' ')
    .toLowerCase()
  return words.split(/\s+/).every((word) => haystack.includes(word))
}

const visibleItems = computed(() =>
  props.items.filter((item) => matchesFilters(item) && matchesQuery(item)),
)

// Table

const sorting = ref<SortingState>([])

const columns = computed<ColumnDef<CollectionEntry>[]>(() => [
  {
    id: 'name',
    accessorFn: (item) => item.name,
    header: () => t('table.name'),
    sortingFn: (a, b) =>
      a.original.name.localeCompare(b.original.name, locale.value, {
        sensitivity: 'base',
        numeric: true,
      }),
  },
  ...props.fields.map((field): ColumnDef<CollectionEntry> => ({
    id: field.id,
    accessorFn: (item) => item.data[field.id],
    header: () => field.name,
    meta: { field },
    sortUndefined: 'last',
    sortingFn: (a, b, id) =>
      compareFieldValues(
        field,
        a.getValue<FieldValue>(id),
        b.getValue<FieldValue>(id),
        locale.value,
      ),
  })),
  {
    id: 'addedAt',
    accessorFn: (item) => item.addedAt,
    header: () => t('table.added'),
    sortDescFirst: true,
  },
])

// Pages of the loaded list. Kept on the current page while editing values
// (which changes the data), back to the first when the search, filters or
// sort change, and pulled back when removing games empties the last page.
const PAGE_SIZES = [25, 50, 100]
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 25 })

watch(
  [query, filters, sorting],
  () => {
    pagination.value = { ...pagination.value, pageIndex: 0 }
  },
  { deep: true },
)

const table = useVueTable({
  get data() {
    return visibleItems.value
  },
  get columns() {
    return columns.value
  },
  state: {
    get sorting() {
      return sorting.value
    },
    get pagination() {
      return pagination.value
    },
  },
  onSortingChange: (updater) => {
    sorting.value =
      typeof updater === 'function' ? updater(sorting.value) : updater
  },
  onPaginationChange: (updater) => {
    pagination.value =
      typeof updater === 'function' ? updater(pagination.value) : updater
  },
  autoResetPageIndex: false,
  getRowId: (item) => item.id,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
})

const pageCount = computed(() => table.getPageCount())
watch(pageCount, (count) => {
  if (pagination.value.pageIndex >= count) {
    pagination.value = {
      ...pagination.value,
      pageIndex: Math.max(count - 1, 0),
    }
  }
})

const pageRange = computed(() => {
  const { pageIndex, pageSize } = pagination.value
  const first = pageIndex * pageSize + 1
  return {
    first,
    last: Math.min(first + pageSize - 1, visibleItems.value.length),
    total: visibleItems.value.length,
  }
})

function setPageSize(size: unknown) {
  const pageSize = Number(size)
  if (PAGE_SIZES.includes(pageSize)) {
    pagination.value = { pageIndex: 0, pageSize }
  }
}

function fieldOf(columnId: string) {
  return props.fields.find((field) => field.id === columnId)
}

function ariaSort(direction: false | 'asc' | 'desc') {
  if (!direction) return 'none'
  return direction === 'asc' ? 'ascending' : 'descending'
}

const addedFormat = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }),
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <div class="relative w-full sm:max-w-xs">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          v-model="query"
          type="search"
          :aria-label="$t('table.search')"
          :placeholder="$t('table.search')"
          class="pl-8"
        />
      </div>
      <DropdownMenu v-if="filterableFields.length">
        <DropdownMenuTrigger as-child>
          <Button variant="outline">
            <ListFilter />
            {{ $t('table.filter') }}
            <Badge v-if="activeFilterCount" variant="secondary" class="ml-1">
              {{ activeFilterCount }}
            </Badge>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-56">
          <DropdownMenuSub v-for="field in filterableFields" :key="field.id">
            <DropdownMenuSubTrigger>{{ field.name }}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuCheckboxItem
                v-for="choice in filterChoices(field)"
                :key="choice.value"
                :model-value="(filters[field.id] ?? []).includes(choice.value)"
                @update:model-value="
                  toggleFilter(field.id, choice.value, $event === true)
                "
                @select.prevent
              >
                {{ choice.label }}
              </DropdownMenuCheckboxItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        v-if="activeFilterCount || query"
        variant="ghost"
        @click="clearFilters"
      >
        <X />
        {{ $t('table.clearFilters') }}
      </Button>
      <p class="ml-auto text-sm text-muted-foreground" aria-live="polite">
        {{
          visibleItems.length === items.length
            ? $t('shelf.gameCount', items.length)
            : $t('table.showing', {
                shown: visibleItems.length,
                total: items.length,
              })
        }}
      </p>
    </div>

    <div class="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              v-for="header in table.getFlatHeaders()"
              :key="header.id"
              :aria-sort="ariaSort(header.column.getIsSorted())"
              :class="{
                'sticky left-0 z-10 min-w-48 bg-card': header.id === 'name',
              }"
            >
              <button
                type="button"
                class="-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 whitespace-nowrap outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                @click="header.column.toggleSorting()"
              >
                {{ (header.column.columnDef.header as () => string)() }}
                <ArrowUp
                  v-if="header.column.getIsSorted() === 'asc'"
                  class="size-3.5"
                  aria-hidden="true"
                />
                <ArrowDown
                  v-else-if="header.column.getIsSorted() === 'desc'"
                  class="size-3.5"
                  aria-hidden="true"
                />
                <ArrowUpDown
                  v-else
                  class="size-3.5 text-muted-foreground/50"
                  aria-hidden="true"
                />
              </button>
            </TableHead>
            <TableHead v-if="editable" class="w-10">
              <span class="sr-only">{{ $t('table.actions') }}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
            <TableCell
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              :class="{
                // Solid, so scrolled cells don't show through, but fading to
                // the row's half-muted hover colour at the same pace.
                'sticky left-0 z-10 bg-card transition-colors [tr:hover>&]:bg-[color-mix(in_oklab,var(--card),var(--muted)_50%)]':
                  cell.column.id === 'name',
              }"
            >
              <component
                :is="row.original.igdbId ? NuxtLink : 'div'"
                v-if="cell.column.id === 'name'"
                :to="
                  row.original.igdbId
                    ? `/games/${row.original.igdbId}`
                    : undefined
                "
                class="flex items-center gap-3 rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="{ 'hover:underline': row.original.igdbId }"
              >
                <GameCover
                  :name="row.original.name"
                  :cover-id="row.original.coverId"
                  size="thumb"
                  class="w-8 shrink-0"
                />
                <span class="line-clamp-2">{{ row.original.name }}</span>
              </component>
              <span
                v-else-if="cell.column.id === 'addedAt'"
                class="whitespace-nowrap text-muted-foreground"
              >
                {{ addedFormat.format(new Date(row.original.addedAt)) }}
              </span>
              <FieldCell
                v-else-if="fieldOf(cell.column.id)"
                :field="fieldOf(cell.column.id)!"
                :value="row.original.data[cell.column.id]"
                :item-name="row.original.name"
                :editable="editable"
                @save="emit('save', row.original.id, cell.column.id, $event)"
              />
            </TableCell>
            <TableCell v-if="editable">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="
                      $t('table.rowActions', { name: row.original.name })
                    "
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-max">
                  <DropdownMenuItem
                    class="text-destructive focus:text-destructive"
                    @select="emit('remove', row.original.id)"
                  >
                    <Trash2 /> {{ $t('table.remove') }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
          <TableRow v-if="!visibleItems.length">
            <TableCell
              :colspan="fields.length + (editable ? 3 : 2)"
              class="py-10 text-center text-muted-foreground"
            >
              {{ $t('table.noMatches') }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <nav
      v-if="visibleItems.length > PAGE_SIZES[0]!"
      class="flex flex-wrap items-center justify-between gap-3 text-sm"
      :aria-label="$t('table.pages')"
    >
      <div class="flex items-center gap-2">
        <span class="text-muted-foreground">{{ $t('table.perPage') }}</span>
        <Select
          :model-value="String(pagination.pageSize)"
          @update:model-value="setPageSize"
        >
          <SelectTrigger
            size="sm"
            class="w-20"
            :aria-label="$t('table.perPage')"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="size in PAGE_SIZES"
              :key="size"
              :value="String(size)"
            >
              {{ size }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-muted-foreground tabular-nums" aria-live="polite">
          {{ $t('table.range', pageRange) }}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          :disabled="!table.getCanPreviousPage()"
          :aria-label="$t('table.previousPage')"
          @click="table.previousPage()"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          :disabled="!table.getCanNextPage()"
          :aria-label="$t('table.nextPage')"
          @click="table.nextPage()"
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  </div>
</template>
