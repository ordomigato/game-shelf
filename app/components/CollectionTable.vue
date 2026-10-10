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
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpToLine,
  FolderInput,
  Heart,
  PackageCheck,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  GripVertical,
  ListFilter,
  MoveDown,
  MoveUp,
  Pencil,
  Search,
  Trash2,
  X,
} from '@lucide/vue'
import { VueDraggable } from 'vue-draggable-plus'
import type {
  CollectionEntry,
  CollectionSummary,
  FieldDefinition,
  FieldValue,
} from '#shared/types/collection'

/**
 * A collection's games as a table: one column per field in its blueprint.
 * Anyone can sort by a column, search, and filter by select and checkbox
 * fields. Owners edit values in place, rename and remove games, and put games in
 * their own order by dragging or from the row menu.
 */
const props = defineProps<{
  fields: FieldDefinition[]
  items: CollectionEntry[]
  editable: boolean
  /** The owner's other collections, for "Got it" or "Move to". */
  moveTargets?: CollectionSummary[]
  /** In the Wishlist, moving a game out reads as "Got it". */
  isWishlist?: boolean
}>()
const emit = defineEmits<{
  save: [itemId: string, fieldId: string, value: FieldValue | null]
  remove: [itemId: string]
  rename: [itemId: string]
  /** Move the game out of this collection into another. */
  moveTo: [itemId: string, collectionId: string]
  /** Put the game on the owner's Wishlist, or take it off. */
  wishlist: [itemId: string, on: boolean]
  /** Place `itemId` right after `afterItemId`, or first when null. */
  move: [itemId: string, afterItemId: string | null]
}>()

const { t, locale } = useI18n()
const titleOf = useCollectionTitle()
const NuxtLink = resolveComponent('NuxtLink')

// Search and filters

const query = ref('')
/** Field id to the values to keep: select options, or "yes"/"no". */
const filters = ref<Record<string, string[]>>({})

/** Whether rows say if they're on the Wishlist (not on the Wishlist itself). */
const showWishlist = computed(
  () =>
    !props.isWishlist &&
    props.items.some((item) => item.wishlisted !== undefined),
)
const WISHLIST_FILTER = '__wishlist'

const filterableFields = computed(() =>
  props.fields.filter(
    (field) =>
      field.type === 'checkbox' ||
      ((field.type === 'select' || field.type === 'multiselect') &&
        field.options?.length),
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

const wishlistChoices = computed(() => [
  { value: 'yes', label: t('table.onYourWishlist') },
  { value: 'no', label: t('table.notOnYourWishlist') },
])

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
  const wishlist = filters.value[WISHLIST_FILTER]
  if (wishlist?.length && !wishlist.includes(item.wishlisted ? 'yes' : 'no')) {
    return false
  }
  return props.fields.every((field) => {
    const wanted = filters.value[field.id]
    if (!wanted?.length) return true
    const value = item.data[field.id]
    if (field.type === 'checkbox') {
      return wanted.includes(value === true ? 'yes' : 'no')
    }
    // A list of choices matches when it has any of the wanted ones.
    if (Array.isArray(value)) return value.some((v) => wanted.includes(v))
    return typeof value === 'string' && wanted.includes(value)
  })
}

function matchesQuery(item: CollectionEntry) {
  const words = query.value.trim().toLowerCase()
  if (!words) return true
  const haystack = [
    item.name,
    ...props.fields
      .filter((field) => ['text', 'select', 'multiselect'].includes(field.type))
      .map((field) => formatFieldValue(field, item.data[field.id])),
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

// Ordering. Only while the table shows the owner's own order: no sort,
// search or filter, so a row's place on screen is its place in the list.
const reorderable = computed(
  () =>
    props.editable &&
    !sorting.value.length &&
    !query.value.trim() &&
    !activeFilterCount.value,
)

const rows = computed(() => table.getRowModel().rows)
const rowsById = computed(() => new Map(rows.value.map((row) => [row.id, row])))
/** The current page as a list the drag-and-drop can rearrange. */
const pageItems = ref<CollectionEntry[]>([])
watch(
  rows,
  (current) => {
    pageItems.value = current.map((row) => row.original)
  },
  { immediate: true },
)

function rowOf(item: CollectionEntry) {
  return rowsById.value.get(item.id)!
}

function indexOf(itemId: string) {
  return props.items.findIndex((item) => item.id === itemId)
}

/** Moves a game so it ends up at `index` in the whole collection. */
function moveTo(itemId: string, index: number) {
  emit('move', itemId, afterIdForIndex(props.items, itemId, index))
  // Show whatever order the parent settled on, even if it kept the old one.
  pageItems.value = rows.value.map((row) => row.original)
}

function onDragged(event: { oldIndex?: number; newIndex?: number }) {
  const { oldIndex, newIndex } = event
  if (oldIndex === undefined || newIndex === undefined) return
  const start = pagination.value.pageIndex * pagination.value.pageSize
  const moved = props.items[start + oldIndex]
  if (moved && oldIndex !== newIndex) moveTo(moved.id, start + newIndex)
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
      <DropdownMenu v-if="filterableFields.length || showWishlist">
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
          <DropdownMenuSub v-if="showWishlist">
            <DropdownMenuSubTrigger>{{
              $t('table.wishlist')
            }}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuCheckboxItem
                v-for="choice in wishlistChoices"
                :key="choice.value"
                :model-value="
                  (filters[WISHLIST_FILTER] ?? []).includes(choice.value)
                "
                @update:model-value="
                  toggleFilter(WISHLIST_FILTER, choice.value, $event === true)
                "
                @select.prevent
              >
                {{ choice.label }}
              </DropdownMenuCheckboxItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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
      <Button v-if="sorting.length" variant="ghost" @click="sorting = []">
        <X />
        {{ $t('table.yourOrder') }}
      </Button>
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
          <!-- Header cells don't react to hover like the rows below. -->
          <TableRow class="hover:bg-transparent">
            <TableHead v-if="reorderable" class="w-8 pr-0">
              <span class="sr-only">{{ $t('table.order') }}</span>
            </TableHead>
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
        <VueDraggable
          v-model="pageItems"
          tag="tbody"
          data-slot="table-body"
          class="[&_tr:last-child]:border-0"
          handle=".drag-handle"
          ghost-class="drag-gap"
          :animation="150"
          :disabled="!reorderable"
          @update="onDragged"
        >
          <TableRow
            v-for="item in pageItems"
            :key="item.id"
            :class="{ 'is-wishlisted': showWishlist && item.wishlisted }"
          >
            <TableCell v-if="reorderable" class="w-8 pr-0">
              <!-- Keyboard users move games from the row menu instead. -->
              <span
                class="drag-handle flex cursor-grab touch-none items-center justify-center rounded-sm py-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                :title="$t('table.drag')"
                aria-hidden="true"
              >
                <GripVertical class="size-4" />
              </span>
            </TableCell>
            <TableCell
              v-for="cell in rowOf(item).getVisibleCells()"
              :key="cell.id"
              :class="{
                // See .pinned-cell in tailwind.css.
                'pinned-cell sticky left-0 z-10': cell.column.id === 'name',
              }"
            >
              <div
                v-if="cell.column.id === 'name'"
                class="flex items-center gap-2"
              >
                <component
                  :is="item.igdbId ? NuxtLink : 'div'"
                  :to="item.igdbId ? `/games/${item.igdbId}` : undefined"
                  class="wishlist-fade flex min-w-0 flex-1 items-center gap-3 rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :class="{ 'hover:underline': item.igdbId }"
                >
                  <GameCover
                    :name="item.name"
                    :cover-id="item.coverId"
                    size="thumb"
                    class="w-8 shrink-0"
                  />
                  <span class="line-clamp-2">{{ item.name }}</span>
                </component>
                <!-- On the Wishlist too: owners toggle it, visitors see it. -->
                <template v-if="showWishlist">
                  <button
                    v-if="editable"
                    type="button"
                    class="shrink-0 rounded-sm p-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    :class="
                      item.wishlisted
                        ? 'text-primary'
                        : 'text-muted-foreground/40 hover:text-primary'
                    "
                    :aria-label="$t('table.onWishlist', { name: item.name })"
                    :aria-pressed="item.wishlisted === true"
                    :title="
                      item.wishlisted
                        ? $t('table.removeFromWishlist')
                        : $t('table.addToWishlist')
                    "
                    @click="emit('wishlist', item.id, !item.wishlisted)"
                  >
                    <Heart
                      class="size-4"
                      :class="{ 'fill-current': item.wishlisted }"
                      aria-hidden="true"
                    />
                  </button>
                  <template v-else-if="item.wishlisted">
                    <Heart
                      class="size-4 shrink-0 fill-current text-primary"
                      aria-hidden="true"
                    />
                    <span class="sr-only">{{ $t('table.wishlisted') }}</span>
                  </template>
                </template>
              </div>
              <span
                v-else-if="cell.column.id === 'addedAt'"
                class="wishlist-fade whitespace-nowrap text-muted-foreground"
              >
                {{ addedFormat.format(new Date(item.addedAt)) }}
              </span>
              <div v-else-if="fieldOf(cell.column.id)" class="wishlist-fade">
                <FieldCell
                  :field="fieldOf(cell.column.id)!"
                  :value="item.data[cell.column.id]"
                  :item-name="item.name"
                  :editable="editable"
                  @save="emit('save', item.id, cell.column.id, $event)"
                />
              </div>
            </TableCell>
            <TableCell v-if="editable">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="$t('table.rowActions', { name: item.name })"
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-max">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <PackageCheck v-if="isWishlist" />
                      <FolderInput v-else />
                      {{ isWishlist ? $t('table.gotIt') : $t('table.moveTo') }}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent class="w-max">
                      <DropdownMenuItem
                        v-for="target in moveTargets ?? []"
                        :key="target.id"
                        @select="emit('moveTo', item.id, target.id)"
                      >
                        {{ titleOf(target) }}
                      </DropdownMenuItem>
                      <DropdownMenuItem v-if="!moveTargets?.length" disabled>
                        {{ $t('table.noOtherCollections') }}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <template v-if="reorderable">
                    <DropdownMenuItem
                      :disabled="indexOf(item.id) === 0"
                      @select="moveTo(item.id, 0)"
                    >
                      <ArrowUpToLine /> {{ $t('table.moveTop') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      :disabled="indexOf(item.id) === 0"
                      @select="moveTo(item.id, indexOf(item.id) - 1)"
                    >
                      <MoveUp /> {{ $t('table.moveUp') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      :disabled="indexOf(item.id) === items.length - 1"
                      @select="moveTo(item.id, indexOf(item.id) + 1)"
                    >
                      <MoveDown /> {{ $t('table.moveDown') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      :disabled="indexOf(item.id) === items.length - 1"
                      @select="moveTo(item.id, items.length - 1)"
                    >
                      <ArrowDownToLine /> {{ $t('table.moveBottom') }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </template>
                  <DropdownMenuItem @select="emit('rename', item.id)">
                    <Pencil /> {{ $t('table.rename') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    class="text-destructive focus:text-destructive"
                    @select="emit('remove', item.id)"
                  >
                    <Trash2 /> {{ $t('table.remove') }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
          <TableRow v-if="!visibleItems.length">
            <TableCell
              :colspan="
                fields.length + 2 + Number(editable) + Number(reorderable)
              "
              class="py-10 text-center text-muted-foreground"
            >
              {{ $t('table.noMatches') }}
            </TableCell>
          </TableRow>
        </VueDraggable>
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
