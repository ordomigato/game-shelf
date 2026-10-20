<script setup lang="ts">
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useVueTable,
  type ColumnDef,
  type PaginationState,
  type VisibilityState,
  type SortingState,
  type Updater,
} from '@tanstack/vue-table'
import { watchDebounced } from '@vueuse/core'
import {
  ArrowDown,
  ArrowUp,
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpToLine,
  FolderPlus,
  PackageCheck,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Ellipsis,
  GripVertical,
  ListFilter,
  Lock,
  MoveDown,
  MoveUp,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from '@lucide/vue'
import { VueDraggable } from 'vue-draggable-plus'
import type {
  CollectionEntry,
  CollectionLink,
  CollectionSummary,
  FieldDefinition,
  FieldValue,
  LibraryItem,
} from '#shared/types/collection'
import {
  COLLECTIONS_FILTER,
  columnOfSortKey,
  GENRES_FILTER,
  LIST_PAGE_SIZES,
  PLATFORMS_FILTER,
  sortKeyOf,
  type ListView,
} from '#shared/utils/list-view'
import { genresText, platformsOf } from '#shared/utils/platforms'

/**
 * A collection's games as a table: one column per field the user keeps.
 * Anyone can sort by a column, search, and filter by select and checkbox
 * fields. Owners edit values in place, remove games, rename games added by
 * hand, and put games in their own order by dragging or from the row menu.
 * Games the owner wants but doesn't have yet are marked and faded.
 *
 * Every game shows its release year and genres from the catalog. The owner
 * also sees the platforms the game is owned and wanted on, and can change
 * them from the cell. Visitors don't get platforms.
 *
 * The same table shows Owned and the Wishlist (`mode`), which have no
 * fields and no order of their own: they list which collections each game
 * is in. For those, `server` hands the
 * sorting, search, filters and paging to the server: `items` is then one
 * page, and the table asks for changes with `view` instead of making them.
 *
 * The owner can hide columns (all but the name). `hiddenColumns` holds the
 * keys of the hidden ones and `hideColumns` asks the page to save a new set.
 */
const props = defineProps<{
  fields: FieldDefinition[]
  items: CollectionEntry[]
  editable: boolean
  /**
   * All of the owner's custom collections, for "Add to": a row lists each
   * with a tick for the ones its game is in. Without them, rows have no
   * such menu.
   */
  addTargets?: CollectionSummary[]
  /** A collection, or one of the owner's two lists. */
  mode?: 'collection' | 'owned' | 'wishlist'
  /** Keys of the hidden columns (shared/utils/columns.ts). */
  hiddenColumns?: string[]
  /** The owner's shelf, for links to the collections in `inCollections`. */
  shelfPath?: string
  /** Set on a list whose server does the sorting, search and filtering. */
  server?: {
    view: ListView
    /** The games matching the search and filters. */
    total: number
    /** Every game on the list. */
    listSize: number
    /** Whether a new page is on its way. The current rows stay visible. */
    loading: boolean
    /** The platforms to filter by. */
    platforms: { id: number; name: string }[]
    /** The genres to filter by. */
    genres: string[]
  }
}>()
const emit = defineEmits<{
  save: [itemId: string, fieldId: string, value: FieldValue | null]
  remove: [itemId: string]
  rename: [itemId: string]
  /** A collection the user ticked was deleted: the page's data is stale. */
  missing: []
  /** The collections a game is in were saved: all of them, as links. */
  collectionsChanged: [itemId: string, collections: CollectionLink[]]
  /** The owner has the game now: it moves from the Wishlist to Owned. */
  gotIt: [itemId: string]
  /** The owner wants the game instead: it moves from Owned to the Wishlist. */
  toWishlist: [itemId: string]
  /** Place `itemId` right after `afterItemId`, or first when null. */
  move: [itemId: string, afterItemId: string | null]
  /** The owner chose which columns to hide: all the hidden keys. */
  hideColumns: [hidden: string[]]
  /** The owner changed the platforms of a game: its new place on the lists. */
  platformsChanged: [saved: LibraryItem]
  /** On a server list: the person changed the page, sort, search or filters. */
  view: [change: Partial<ListView>]
}>()

const { t, locale } = useI18n()
const NuxtLink = resolveComponent('NuxtLink')

// Search and filters

const query = ref(props.server?.view.q ?? '')
/** Field id to the values to keep: select options, or "yes"/"no". */
const clientFilters = ref<Record<string, string[]>>({})
const filters = computed(
  () => props.server?.view.filters ?? clientFilters.value,
)

// A server list asks for a new search once typing pauses, and follows the
// address when it changes by itself (the back button).
let lastEmittedQuery: string | null = null
watchDebounced(
  query,
  (text) => {
    if (props.server && text.trim() !== props.server.view.q) {
      lastEmittedQuery = text.trim()
      emit('view', { q: lastEmittedQuery, page: 1 })
    }
  },
  { debounce: 300 },
)
// The address echoing what was typed must not overwrite letters typed since.
watch(
  () => props.server?.view.q,
  (text) => {
    if (text === undefined || text === lastEmittedQuery) return
    lastEmittedQuery = null
    if (text !== query.value.trim()) query.value = text
  },
)

const tableMode = computed(() => props.mode ?? 'collection')
const isList = computed(() => tableMode.value !== 'collection')

/** Whether a collection has games the owner only wants. */
const showWanted = computed(
  () => !isList.value && props.items.some((item) => item.wanted),
)
const STATE_FILTER = '__state'

/** Whether rows list the collections each game is in (on the lists). */
const showCollections = computed(() => isList.value)
// Platforms are the owner's business, so visitors' tables have no such column.
const showPlatforms = computed(() => props.editable)

/** Whether a game is only wanted, so it's marked and faded. */
const isWanted = (item: CollectionEntry) =>
  !isList.value && item.wanted && item.owned === false

const showGotIt = (item: CollectionEntry) =>
  tableMode.value === 'wishlist' || (!isList.value && item.wanted)
const showToWishlist = (item: CollectionEntry) =>
  tableMode.value === 'owned' ||
  (!isList.value && item.owned && !item.wishlisted)

// Changing the collections a game is in, from the row menu or the dialog.
// Only what was ticked or unticked is sent, so a stale row can't undo
// changes made elsewhere.
const { saving: savingItems, save: saveCollections } = useItemCollections(() =>
  emit('missing'),
)
const targets = computed(() => props.addTargets ?? [])
const { limits } = usePlan()
const isFull = (item: CollectionEntry, target: CollectionSummary) =>
  collectionFullFor(
    target,
    limits.value.gamesPerCollection,
    isIn(item, target.id),
  )
const isIn = (item: CollectionEntry, collectionId: string) =>
  item.inCollections?.some((collection) => collection.id === collectionId) ??
  false

async function changeCollections(
  item: CollectionEntry,
  change: { add: string[]; remove: string[] },
) {
  const links = await saveCollections(item.id, change, targets.value)
  if (!links) return false
  emit('collectionsChanged', item.id, links)
  return true
}

function toggleTarget(
  item: CollectionEntry,
  collectionId: string,
  on: boolean,
) {
  return changeCollections(item, {
    add: on ? [collectionId] : [],
    remove: on ? [] : [collectionId],
  })
}

const editingItem = ref<CollectionEntry | null>(null)
const editingOpen = ref(false)

function editCollections(item: CollectionEntry) {
  editingItem.value = item
  editingOpen.value = true
}

async function saveEditing(change: { add: string[]; remove: string[] }) {
  if (
    editingItem.value &&
    (await changeCollections(editingItem.value, change))
  ) {
    editingOpen.value = false
  }
}
const collectionTitles = (item: CollectionEntry) =>
  (item.inCollections ?? []).map((collection) => collection.title)

const platformChoices = computed(() => {
  if (props.server) {
    return props.server.platforms.map(({ id, name }) => ({
      value: String(id),
      label: name,
    }))
  }
  // The platforms some game here is owned or wanted on.
  const named = new Map<number, string>()
  for (const item of props.items) {
    const { owned, wanted } = platformsOf(item)
    for (const { id, name } of [...owned, ...wanted]) named.set(id, name)
  }
  return [...named]
    .map(([id, name]) => ({ value: String(id), label: name }))
    .sort((a, b) => a.label.localeCompare(b.label, locale.value))
})
const genreChoices = computed(() =>
  (props.server
    ? props.server.genres
    : [...new Set(props.items.flatMap((item) => item.genres))].sort((a, b) =>
        a.localeCompare(b, locale.value),
      )
  ).map((genre) => ({ value: genre, label: genre })),
)
const collectionChoices = computed(() =>
  props.server
    ? targets.value.map(({ id, title }) => ({ value: id, label: title }))
    : [],
)

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

const stateChoices = computed(() => [
  { value: 'owned', label: t('table.owned') },
  { value: 'wanted', label: t('table.wishlist') },
])

function toggleFilter(fieldId: string, value: string, on: boolean) {
  const current = filters.value[fieldId] ?? []
  const next = {
    ...filters.value,
    [fieldId]: on
      ? [...current, value]
      : current.filter((existing) => existing !== value),
  }
  if (props.server) emit('view', { filters: next, page: 1 })
  else clientFilters.value = next
}

function clearFilters() {
  query.value = ''
  if (props.server) emit('view', { q: '', filters: {}, page: 1 })
  else clientFilters.value = {}
}

function matchesFilters(item: CollectionEntry) {
  const state = filters.value[STATE_FILTER]
  if (
    state?.length &&
    !(
      (state.includes('owned') && item.owned) ||
      (state.includes('wanted') && item.wanted)
    )
  ) {
    return false
  }
  const genres = filters.value[GENRES_FILTER]
  if (genres?.length && !item.genres.some((genre) => genres.includes(genre))) {
    return false
  }
  const platformIds = filters.value[PLATFORMS_FILTER]
  if (
    platformIds?.length &&
    ![...(item.ownedOn ?? []), ...(item.wantedOn ?? [])].some((id) =>
      platformIds.includes(String(id)),
    )
  ) {
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

/** The names of every platform the game is owned or wanted on. */
function platformNamesOf(item: CollectionEntry) {
  const { owned, wanted } = platformsOf(item)
  return [...owned, ...wanted].map(({ name }) => name)
}

function matchesQuery(item: CollectionEntry) {
  const words = query.value.trim().toLowerCase()
  if (!words) return true
  const haystack = [
    item.name,
    ...collectionTitles(item),
    ...platformNamesOf(item),
    ...props.fields
      .filter((field) => ['text', 'select', 'multiselect'].includes(field.type))
      .map((field) => formatFieldValue(field, item.data[field.id])),
  ]
    .join(' ')
    .toLowerCase()
  return words.split(/\s+/).every((word) => haystack.includes(word))
}

// A server list's items already match the search and filters.
const visibleItems = computed(() =>
  props.server
    ? props.items
    : props.items.filter((item) => matchesFilters(item) && matchesQuery(item)),
)

// Table

const clientSorting = ref<SortingState>([])
const sorting = computed<SortingState>(() => {
  const view = props.server?.view
  if (!view) return clientSorting.value
  return view.sort
    ? [{ id: columnOfSortKey(view.sort), desc: view.dir === 'desc' }]
    : []
})
function setSorting(next: SortingState) {
  const first = next[0]
  if (props.server) {
    emit('view', {
      sort: first ? sortKeyOf(first.id) : null,
      dir: first?.desc ? 'desc' : 'asc',
      page: 1,
    })
  } else {
    clientSorting.value = next
  }
}

const columnVisibility = computed<VisibilityState>(() =>
  Object.fromEntries((props.hiddenColumns ?? []).map((id) => [id, false])),
)

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
  ...(showCollections.value
    ? [
        {
          id: 'inCollections',
          accessorFn: (item) => collectionTitles(item).join(', '),
          header: () => t('table.inCollections'),
          sortingFn: (a, b, id) =>
            a
              .getValue<string>(id)
              .localeCompare(b.getValue<string>(id), locale.value, {
                sensitivity: 'base',
                numeric: true,
              }),
        } satisfies ColumnDef<CollectionEntry>,
      ]
    : []),
  {
    id: 'year',
    accessorFn: (item) => item.year ?? undefined,
    header: () => t('table.year'),
    sortUndefined: 'last',
    sortDescFirst: false,
  },
  {
    id: 'genre',
    accessorFn: (item) => item.genres[0],
    header: () => t('table.genre'),
    sortUndefined: 'last',
    sortingFn: (a, b, id) =>
      a
        .getValue<string>(id)
        .localeCompare(b.getValue<string>(id), locale.value, {
          sensitivity: 'base',
          numeric: true,
        }),
  },
  ...(showPlatforms.value
    ? [
        {
          id: 'platforms',
          accessorFn: (item) => platformNamesOf(item).join(', ') || undefined,
          header: () => t('table.platforms'),
          sortUndefined: 'last',
          sortingFn: (a, b, id) =>
            a
              .getValue<string>(id)
              .localeCompare(b.getValue<string>(id), locale.value, {
                sensitivity: 'base',
                numeric: true,
              }),
        } satisfies ColumnDef<CollectionEntry>,
      ]
    : []),
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

// The columns the owner can hide: all but the name.
const hideable = computed(() =>
  columns.value
    .filter((column) => column.id !== 'name')
    .map((column) => ({
      id: column.id!,
      label: (column.header as () => string)(),
    })),
)
const hiddenCount = computed(
  () => hideable.value.filter(({ id }) => id in columnVisibility.value).length,
)

// The page already says how many games there are, so the table only
// reports a count when filters or search narrow it.
const filtered = computed(
  () => matchCount.value !== (props.server?.listSize ?? props.items.length),
)

function setColumnHidden(columnId: string, hidden: boolean) {
  const others = (props.hiddenColumns ?? []).filter((id) => id !== columnId)
  const next = hidden ? [...others, columnId] : others
  // Sorting by a column that is gone would leave the order unexplained.
  if (hidden && sorting.value[0]?.id === columnId) setSorting([])
  emit('hideColumns', next)
}

function showAllColumns() {
  emit('hideColumns', [])
}

// Pages of the loaded list. Kept on the current page while editing values
// (which changes the data), back to the first when the search, filters or
// sort change, and pulled back when removing games empties the last page.
const PAGE_SIZES: readonly number[] = LIST_PAGE_SIZES
const clientPagination = ref<PaginationState>({ pageIndex: 0, pageSize: 25 })
const pagination = computed<PaginationState>(() =>
  props.server
    ? {
        pageIndex: props.server.view.page - 1,
        pageSize: props.server.view.size,
      }
    : clientPagination.value,
)
function setPagination(next: PaginationState) {
  if (!props.server) {
    clientPagination.value = next
  } else if (next.pageSize !== props.server.view.size) {
    emit('view', { size: next.pageSize, page: 1 })
  } else {
    emit('view', { page: next.pageIndex + 1 })
  }
}

watch(
  [query, clientFilters, clientSorting],
  () => {
    clientPagination.value = { ...clientPagination.value, pageIndex: 0 }
  },
  { deep: true },
)

const table = useVueTable({
  get data() {
    return visibleItems.value
  },
  get manualSorting() {
    return Boolean(props.server)
  },
  get manualPagination() {
    return Boolean(props.server)
  },
  get pageCount() {
    return props.server
      ? Math.max(1, Math.ceil(props.server.total / props.server.view.size))
      : undefined
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
    get columnVisibility() {
      return columnVisibility.value
    },
  },
  onSortingChange: (updater: Updater<SortingState>) => {
    setSorting(typeof updater === 'function' ? updater(sorting.value) : updater)
  },
  onPaginationChange: (updater: Updater<PaginationState>) => {
    setPagination(
      typeof updater === 'function' ? updater(pagination.value) : updater,
    )
  },
  autoResetPageIndex: false,
  getRowId: (item) => item.id,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
})

const pageCount = computed(() => table.getPageCount())
watch(pageCount, (count) => {
  if (!props.server && pagination.value.pageIndex >= count) {
    setPagination({ ...pagination.value, pageIndex: Math.max(count - 1, 0) })
  }
})

const matchCount = computed(() =>
  props.server ? props.server.total : visibleItems.value.length,
)
const pageRange = computed(() => {
  const { pageIndex, pageSize } = pagination.value
  const first = pageIndex * pageSize + 1
  return {
    first,
    last: Math.min(first + pageSize - 1, matchCount.value),
    total: matchCount.value,
  }
})

function setPageSize(size: unknown) {
  const pageSize = Number(size)
  if (PAGE_SIZES.includes(pageSize)) setPagination({ pageIndex: 0, pageSize })
}

// Ordering. Only while the table shows the owner's own order: no sort,
// search or filter, so a row's place on screen is its place in the list.
const reorderable = computed(
  () =>
    props.editable &&
    !isList.value &&
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
          :aria-label="server ? $t('table.searchGames') : $t('table.search')"
          :placeholder="server ? $t('table.searchGames') : $t('table.search')"
          class="pl-8"
        />
      </div>
      <DropdownMenu
        v-if="
          filterableFields.length ||
          showWanted ||
          collectionChoices.length ||
          platformChoices.length ||
          genreChoices.length
        "
      >
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
          <DropdownMenuSub v-if="showWanted">
            <DropdownMenuSubTrigger>{{
              $t('table.state')
            }}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuCheckboxItem
                v-for="choice in stateChoices"
                :key="choice.value"
                :model-value="
                  (filters[STATE_FILTER] ?? []).includes(choice.value)
                "
                @update:model-value="
                  toggleFilter(STATE_FILTER, choice.value, $event === true)
                "
                @select.prevent
              >
                {{ choice.label }}
              </DropdownMenuCheckboxItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub v-if="collectionChoices.length">
            <DropdownMenuSubTrigger>{{
              $t('table.inCollections')
            }}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuCheckboxItem
                v-for="choice in collectionChoices"
                :key="choice.value"
                :model-value="
                  (filters[COLLECTIONS_FILTER] ?? []).includes(choice.value)
                "
                @update:model-value="
                  toggleFilter(
                    COLLECTIONS_FILTER,
                    choice.value,
                    $event === true,
                  )
                "
                @select.prevent
              >
                {{ choice.label }}
              </DropdownMenuCheckboxItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub v-if="genreChoices.length">
            <DropdownMenuSubTrigger>{{
              $t('table.genre')
            }}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuCheckboxItem
                v-for="choice in genreChoices"
                :key="choice.value"
                :model-value="
                  (filters[GENRES_FILTER] ?? []).includes(choice.value)
                "
                @update:model-value="
                  toggleFilter(GENRES_FILTER, choice.value, $event === true)
                "
                @select.prevent
              >
                {{ choice.label }}
              </DropdownMenuCheckboxItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub v-if="platformChoices.length">
            <DropdownMenuSubTrigger>{{
              $t('table.platforms')
            }}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuCheckboxItem
                v-for="choice in platformChoices"
                :key="choice.value"
                :model-value="
                  (filters[PLATFORMS_FILTER] ?? []).includes(choice.value)
                "
                @update:model-value="
                  toggleFilter(PLATFORMS_FILTER, choice.value, $event === true)
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
      <Button v-if="sorting.length" variant="ghost" @click="setSorting([])">
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
      <p
        v-if="filtered"
        class="ml-auto text-sm text-muted-foreground"
        aria-live="polite"
      >
        {{
          $t('table.showing', {
            shown: matchCount,
            total: server?.listSize ?? items.length,
          })
        }}
      </p>
      <Popover v-if="editable">
        <PopoverTrigger as-child>
          <Button
            variant="outline"
            size="icon"
            :class="{ 'ml-auto': !filtered }"
            :title="$t('table.columns')"
            :aria-label="$t('table.columns')"
          >
            <Columns3 />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" class="w-56 p-2">
          <ul class="flex flex-col">
            <li v-for="column in hideable" :key="column.id">
              <Label
                class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 font-normal hover:bg-accent"
              >
                <Checkbox
                  :model-value="!(column.id in columnVisibility)"
                  @update:model-value="
                    setColumnHidden(column.id, $event !== true)
                  "
                />
                {{ column.label }}
              </Label>
            </li>
          </ul>
          <Button
            variant="ghost"
            size="sm"
            class="mt-1 w-full justify-start"
            :disabled="!hiddenCount"
            @click="showAllColumns"
          >
            {{ $t('table.showAllColumns') }}
          </Button>
        </PopoverContent>
      </Popover>
    </div>

    <div
      class="overflow-x-auto rounded-lg border bg-card transition-opacity"
      :class="{ 'opacity-60': server?.loading }"
      :aria-busy="server?.loading || undefined"
    >
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
                <Lock
                  v-if="fieldOf(header.id)?.hidden"
                  class="size-3.5 text-muted-foreground"
                  role="img"
                  :title="$t('table.hiddenFromVisitors')"
                  :aria-label="$t('table.hiddenFromVisitors')"
                />
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
          chosen-class="drag-chosen"
          :animation="150"
          :disabled="!reorderable"
          @update="onDragged"
        >
          <TableRow
            v-for="item in pageItems"
            :key="item.id"
            :class="{ 'is-wanted': isWanted(item) }"
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
                  class="wanted-fade flex min-w-0 flex-1 items-center gap-3 rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                <Badge
                  v-if="!isList && item.wanted"
                  variant="outline"
                  class="shrink-0 text-muted-foreground"
                >
                  {{ $t('table.wishlist') }}
                </Badge>
              </div>
              <div
                v-else-if="cell.column.id === 'inCollections'"
                class="wanted-fade flex flex-wrap items-center gap-1.5"
              >
                <ul class="flex flex-wrap gap-1.5">
                  <li
                    v-for="collection in item.inCollections"
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
                <Button
                  v-if="editable && addTargets"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="$t('table.editCollections', { name: item.name })"
                  @click="editCollections(item)"
                >
                  <Plus />
                </Button>
              </div>
              <span
                v-else-if="cell.column.id === 'year'"
                class="wanted-fade text-muted-foreground tabular-nums"
              >
                {{ item.year }}
              </span>
              <span
                v-else-if="cell.column.id === 'genre'"
                class="wanted-fade block max-w-48 truncate text-muted-foreground"
                :title="genresText(item.genres) || undefined"
              >
                {{ genresText(item.genres) }}
              </span>
              <PlatformsCell
                v-else-if="cell.column.id === 'platforms'"
                :item="item"
                :editable="editable"
                @changed="emit('platformsChanged', $event)"
              />
              <span
                v-else-if="cell.column.id === 'addedAt'"
                class="wanted-fade whitespace-nowrap text-muted-foreground"
              >
                {{ addedFormat.format(new Date(item.addedAt)) }}
              </span>
              <div v-else-if="fieldOf(cell.column.id)" class="wanted-fade">
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
                  <DropdownMenuItem
                    v-if="showGotIt(item)"
                    @select="emit('gotIt', item.id)"
                  >
                    <PackageCheck /> {{ $t('table.gotIt') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    v-if="showToWishlist(item)"
                    @select="emit('toWishlist', item.id)"
                  >
                    <Star /> {{ $t('table.moveToWishlist') }}
                  </DropdownMenuItem>
                  <DropdownMenuSub v-if="addTargets">
                    <DropdownMenuSubTrigger>
                      <FolderPlus /> {{ $t('table.addTo') }}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent class="w-max">
                      <DropdownMenuCheckboxItem
                        v-for="target in targets"
                        :key="target.id"
                        :model-value="isIn(item, target.id)"
                        :disabled="
                          savingItems.has(item.id) || isFull(item, target)
                        "
                        @update:model-value="
                          toggleTarget(item, target.id, $event === true)
                        "
                        @select.prevent
                      >
                        {{ target.title }}
                        <span
                          v-if="isFull(item, target)"
                          class="ml-auto pl-2 text-xs text-muted-foreground"
                          >{{ $t('addToCollection.full') }}</span
                        >
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuItem v-if="!targets.length" disabled>
                        {{ $t('table.noCollections') }}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator
                    v-if="showGotIt(item) || showToWishlist(item) || addTargets"
                  />
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
                  <DropdownMenuItem
                    v-if="item.igdbId === null"
                    @select="emit('rename', item.id)"
                  >
                    <Pencil /> {{ $t('table.rename') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    class="text-destructive focus:text-destructive"
                    @select="emit('remove', item.id)"
                  >
                    <Trash2 />
                    {{
                      tableMode === 'owned'
                        ? $t('table.removeFromOwned')
                        : tableMode === 'wishlist'
                          ? $t('table.removeFromWishlist')
                          : $t('table.remove')
                    }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
          <TableRow v-if="!visibleItems.length">
            <TableCell
              :colspan="
                table.getVisibleLeafColumns().length +
                Number(editable) +
                Number(reorderable)
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
      v-if="matchCount > PAGE_SIZES[0]!"
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

    <ItemCollectionsDialog
      v-model:open="editingOpen"
      :item="editingItem"
      :collections="targets"
      :saving="editingItem ? savingItems.has(editingItem.id) : false"
      @save="saveEditing"
    />
  </div>
</template>
