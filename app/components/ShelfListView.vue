<script setup lang="ts">
import {
  ArrowLeft,
  Download,
  Ellipsis,
  Pencil,
  PenLine,
  Plus,
} from '@lucide/vue'
import { FetchError } from 'ofetch'
import { toast } from 'vue-sonner'
import {
  DEFAULT_LIST_PAGE_SIZE,
  LIST_PAGE_SIZES,
  viewFromQuery,
  viewToQuery,
  pruneView,
  type ListView,
} from '#shared/utils/list-view'
import type {
  CollectionEntry,
  CollectionLink,
  CollectionVisibility,
  FieldValue,
  ListDetail,
  LibraryItem,
  ListName,
} from '#shared/types/collection'

/**
 * Owned or the Wishlist at `/u/<username>/shelf/<list>`: the owner's games
 * on that list, as a table. The owner always sees it, with everything they
 * can change. Anyone else sees it read-only when the owner made it public,
 * and gets the not found page when they didn't.
 */
const props = defineProps<{ list: ListName }>()

const route = useRoute()
const { t, n } = useI18n()
const { limits } = usePlan()
const collections = useCollections()
const leaving = useUnownConfirm()

const username = computed(() => String(route.params.username).toLowerCase())
const shelfPath = computed(() => `/u/${username.value}/shelf`)
const title = computed(() =>
  props.list === 'owned' ? t('shelf.owned') : t('shelf.wishlist'),
)
const shelfName = computed(() =>
  collections.isMine(username.value)
    ? t('shelf.myTitle')
    : t('shelf.userTitle', { username: username.value }),
)

// Rows per page is remembered on this device. The address names it only
// once someone has chosen one.
const SIZE_KEY = 'gameshelf:list-page-size'
const savedSize = ref(DEFAULT_LIST_PAGE_SIZE)
if (import.meta.client) {
  try {
    const stored = Number(localStorage.getItem(SIZE_KEY))
    if ((LIST_PAGE_SIZES as readonly number[]).includes(stored)) {
      savedSize.value = stored
    }
  } catch {
    // Storage can be blocked. The default is fine.
  }
}

// The page, rows per page, sort, search and filters are the address's query,
// so the back button and a reload land in the same place.
const view = computed(() => viewFromQuery(route.query, savedSize.value))
const viewKey = computed(() =>
  JSON.stringify(viewToQuery(view.value, { withSize: true })),
)

// Value saves in flight. An answer that was read while one started or
// finished may predate it, so it is read again rather than shown.
let valueSaves = 0
let valueEdits = 0

// The server sorts, searches and filters, so each change asks for one page.
// The rows on screen stay until the new page arrives, and a newer request
// cancels an older one so a slow answer never replaces a fresher one.
const { data, status, error, refresh } = useAsyncData(
  () => `list-${username.value}-${props.list}`,
  (_nuxt, { signal }) => fetchPage(signal),
  { server: false, watch: [username, () => props.list, viewKey] },
)
const notFound = computed(() => error.value?.statusCode === 404)
const isOwner = computed(() => data.value?.isOwner === true)

async function fetchPage(signal: AbortSignal): Promise<ListDetail> {
  const requested = view.value
  const key = viewKey.value
  for (let attempt = 0; ; attempt++) {
    const mark = valueEdits
    const page = await collections.getList(
      username.value,
      props.list,
      requested,
      signal,
    )
    if ((mark !== valueEdits || valueSaves) && attempt < 3) continue
    // Only a finished request for what's still asked for may move the
    // address, never an edit made to the rows on screen.
    if (key === viewKey.value) settleView(requested, page)
    return page
  }
}

/**
 * Brings the address in line with the answer: the last page when the page
 * asked for is past the end, and no sort or filter on a field that's gone.
 */
function settleView(requested: ListView, page: ListDetail) {
  const settled = {
    ...pruneView(requested, new Set(page.fields.map((field) => field.id))),
    page: page.page,
  }
  const asQuery = (v: ListView) =>
    JSON.stringify(viewToQuery(v, { withSize: true }))
  if (asQuery(settled) !== asQuery(requested)) showView(settled, true)
}

// Refetching after a change made here fills the gap without dimming. The
// flag belongs to the address it was set for, so moving elsewhere loads
// with the usual dimming.
const quietFor = ref<string | null>(null)
async function refetchQuietly() {
  const key = viewKey.value
  quietFor.value = key
  try {
    await refresh()
  } finally {
    if (quietFor.value === key) quietFor.value = null
  }
}
const loading = computed(
  () =>
    status.value === 'pending' &&
    Boolean(data.value) &&
    quietFor.value !== viewKey.value,
)

/** Changes what the list shows, by changing the address. */
function showView(change: Partial<ListView>, replace = false) {
  if (change.size !== undefined) {
    savedSize.value = change.size
    try {
      localStorage.setItem(SIZE_KEY, String(change.size))
    } catch {
      // Not remembered, which is fine.
    }
  }
  const next = { ...view.value, ...change }
  void navigateTo(
    {
      path: route.path,
      query: viewToQuery(next, {
        withSize: 'size' in route.query || change.size !== undefined,
      }),
    },
    { replace },
  )
}
// Typing a search shouldn't fill the history with every pause.
const onView = (change: Partial<ListView>) =>
  showView(
    change,
    'q' in change &&
      Object.keys(change).every((key) => key === 'q' || key === 'page'),
  )

const tableServer = computed(() =>
  data.value
    ? {
        view: view.value,
        total: data.value.total,
        listSize: data.value.itemCount,
        loading: loading.value,
        platforms: data.value.platforms,
        genres: data.value.genres,
      }
    : undefined,
)

// The games limit counts the whole library, owned and wishlisted, so both
// headers show the library total first, then this list's own count.
// How each header words the count of its own list.
const usageKey = {
  owned: { key: 'limits.ownedUsage' },
  wishlist: { key: 'limits.wishlistUsage' },
}
const total = computed(() => data.value?.libraryCount ?? 0)
const overLimit = computed(() => total.value > limits.value.games)

useHead(() => ({ title: t('app.title', { page: title.value }) }))

// The loaded page is held shallowly, so changes replace it rather than
// editing it in place.
function setItems(items: CollectionEntry[]) {
  if (!data.value) return
  data.value = { ...data.value, items }
}

/**
 * Takes a game off the page at once and from the counts, then asks for the
 * page again so the next game takes its place.
 */
function leaveView(itemId: string) {
  if (!data.value) return
  const items = data.value.items.filter((entry) => entry.id !== itemId)
  if (items.length === data.value.items.length) return
  data.value = {
    ...data.value,
    items,
    itemCount: data.value.itemCount - 1,
    total: data.value.total - 1,
  }
  void refetchQuietly()
}

/** Whether a game is still on this list after a change. */
const onList = (item: LibraryItem) =>
  props.list === 'owned' ? item.owned : item.wishlisted

const moves = useListMoves(shelfPath)

// The owner's collections, for the offer after "Got it". Phones have no
// sidebar, so load them here if nothing has yet.
const sidebar = useMyCollections()
const mine = computed(() => sidebar.list.value ?? [])
onMounted(() => {
  onNuxtReady(() => {
    watch(
      isOwner,
      (owner) => {
        if (owner) void sidebar.load().catch(() => {})
      },
      { immediate: true },
    )
  })
})
const gotItItem = ref<CollectionEntry | null>(null)
const offeringCollections = ref(false)

/**
 * Marks a wanted game as owned. It leaves the Wishlist. Then, if there are
 * collections it isn't in yet, offers to add it to some of them.
 */
async function gotIt(itemId: string) {
  const item = data.value?.items.find((entry) => entry.id === itemId)
  if (!(await moves.gotIt(itemId)) || !item) return
  leaveView(itemId)
  const alreadyIn = item.inCollections?.map(({ id }) => id) ?? []
  // The list may still be loading, or have failed to when the page opened.
  const owned = await sidebar.load().catch(() => mine.value)
  if (owned.some(({ id }) => !alreadyIn.includes(id))) {
    gotItItem.value = item
    offeringCollections.value = true
  }
}

/** Shows the collections a game is in after they were saved. */
function collectionsChanged(itemId: string, links: CollectionLink[]) {
  setItems(
    (data.value?.items ?? []).map((entry) =>
      entry.id === itemId ? { ...entry, inCollections: links } : entry,
    ),
  )
  // A collection filter or sort may now put the game elsewhere.
  void refetchQuietly()
}

/**
 * Shows a game's platforms after they were saved. Ticking the other list's
 * platforms can take it off this one, and a platform sort or filter may put
 * it elsewhere.
 */
function platformsChanged(saved: LibraryItem) {
  if (!onList(saved)) {
    leaveView(saved.id)
    return
  }
  setItems(
    (data.value?.items ?? []).map((entry) =>
      entry.id === saved.id
        ? {
            ...entry,
            owned: saved.owned,
            wishlisted: saved.wishlisted,
            wanted: saved.wishlisted,
            ownedOn: saved.ownedOn,
            wantedOn: saved.wantedOn,
          }
        : entry,
    ),
  )
  void refetchQuietly()
}

/** Moves an owned game to the Wishlist. It leaves Owned. */
async function toWishlist(itemId: string) {
  if (!(await moves.toWishlist(itemId))) return
  leaveView(itemId)
}

/** Saves the hidden columns, showing the change straight away. */
async function saveHiddenColumns(hidden: string[]) {
  if (!data.value) return
  const before = data.value.hiddenColumns
  data.value = { ...data.value, hiddenColumns: hidden }
  try {
    await collections.saveListColumns(props.list, hidden)
  } catch {
    if (data.value) data.value = { ...data.value, hiddenColumns: before }
    toast.error(t('table.columnsSaveFailed'))
  }
}

/** Saves one value straight away in the table, undoing it if saving fails. */
async function saveValue(
  itemId: string,
  fieldId: string,
  value: FieldValue | null,
) {
  const item = data.value?.items.find((entry) => entry.id === itemId)
  if (!item) return
  const before = item.data[fieldId]
  /** Sets or clears one field on one row, leaving the rest as they are. */
  const setField = (next: FieldValue | undefined) =>
    setItems(
      (data.value?.items ?? []).map((entry) => {
        if (entry.id !== itemId) return entry
        const { [fieldId]: _old, ...rest } = entry.data
        return {
          ...entry,
          data: next === undefined ? rest : { ...rest, [fieldId]: next },
        }
      }),
    )
  setField(value ?? undefined)
  valueSaves += 1
  valueEdits += 1
  try {
    const saved = await collections.updateItemValues(itemId, {
      [fieldId]: value,
    })
    setField(saved.data[fieldId])
  } catch {
    setField(before)
    toast.error(t('table.saveFailed'))
  } finally {
    valueSaves -= 1
    valueEdits += 1
  }
  // Sorting and filtering by this field may now put the row elsewhere.
  void refetchQuietly()
}

const changingVisibility = ref(false)

/** Makes the list private or public. Resolves whether it worked. */
async function setVisibility(visibility: CollectionVisibility) {
  if (!data.value) return false
  changingVisibility.value = true
  try {
    await collections.setListVisibility(props.list, visibility)
    data.value = { ...data.value, visibility }
    toast.success(
      visibility === 'public'
        ? t('lists.nowPublic', { list: title.value })
        : t('lists.nowPrivate', { list: title.value }),
    )
    return true
  } catch {
    toast.error(t('visibility.failed'))
    return false
  } finally {
    changingVisibility.value = false
  }
}

const exporting = ref(false)

/** Downloads the whole list as CSV, whatever the search and filters. */
async function exportCsv() {
  exporting.value = true
  try {
    saveFile(await collections.exportList(props.list), `${props.list}.csv`)
  } catch (e) {
    toast.error(
      e instanceof FetchError && e.statusCode === 429
        ? t('account.settings.exportTooSoon')
        : t('lists.exportFailed'),
    )
  } finally {
    exporting.value = false
  }
}

/**
 * Takes a game off this list. When that leaves it on no list, it's
 * deleted, so the person confirms first (naming the collections it leaves).
 */
async function removeItem(itemId: string) {
  const item = data.value?.items.find((entry) => entry.id === itemId)
  // Only the owner's rows carry the flags, and only the owner removes.
  if (!item || item.owned === undefined || item.wishlisted === undefined) return
  try {
    const saved = await leaving.leave(
      {
        id: item.id,
        name: item.name,
        owned: item.owned,
        wishlisted: item.wishlisted,
      },
      props.list,
    )
    if (!saved) return
    if (!saved.item || !onList(saved.item)) leaveView(itemId)
  } catch {
    toast.error(t('table.removeFailed'))
  }
}

const addingByHand = ref(false)
const editingFields = ref(false)
const renaming = ref(false)
const renamingItem = ref<CollectionEntry | null>(null)

function startRenaming(itemId: string) {
  renamingItem.value =
    data.value?.items.find((entry) => entry.id === itemId) ?? null
  renaming.value = Boolean(renamingItem.value)
}

function onRenamed(saved: LibraryItem) {
  setItems(
    (data.value?.items ?? []).map((entry) =>
      entry.id === saved.id ? { ...entry, name: saved.name } : entry,
    ),
  )
  void refetchQuietly()
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <Button as-child variant="ghost" size="sm" class="-ml-2">
        <NuxtLink :to="shelfPath">
          <ArrowLeft />
          {{ $t('collection.back', { shelf: shelfName }) }}
        </NuxtLink>
      </Button>
    </div>

    <div v-if="notFound" class="py-16 text-center">
      <h1 class="text-3xl font-bold">{{ $t('error.notFoundTitle') }}</h1>
      <p class="mt-2 text-muted-foreground">{{ $t('error.notFoundBody') }}</p>
    </div>

    <div
      v-else-if="!data && !error"
      class="flex flex-col gap-4"
      aria-hidden="true"
    >
      <Skeleton class="h-9 w-64" />
      <Skeleton class="h-5 w-96 max-w-full" />
    </div>

    <div v-else-if="error" class="py-12 text-center">
      <p class="text-lg font-medium">{{ $t('lists.loadFailed') }}</p>
      <Button class="mt-4" @click="refresh()">{{ $t('shelf.retry') }}</Button>
    </div>

    <template v-else-if="data">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex flex-col gap-2">
          <h1 class="text-3xl font-bold">{{ title }}</h1>
          <div
            class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <span v-if="!data.isOwner" data-testid="list-usage">{{
              $t('shelf.gameCount', data.itemCount)
            }}</span>
            <i18n-t
              v-else
              scope="global"
              :keypath="usageKey[list].key"
              tag="span"
              data-testid="list-usage"
            >
              <template #used>
                <span
                  data-testid="list-total"
                  :class="{ 'font-medium text-destructive': overLimit }"
                  >{{
                    $t('limits.usedOf', {
                      used: n(total),
                      limit: n(limits.games),
                    })
                  }}</span
                >
              </template>
              <template #count>{{ n(data.itemCount) }}</template>
            </i18n-t>
          </div>
          <p
            v-if="data.isOwner"
            class="max-w-prose text-sm text-muted-foreground"
          >
            {{
              list === 'owned'
                ? $t('lists.ownedHint')
                : $t('lists.wishlistHint')
            }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <VisibilityMenu
            v-if="data.isOwner"
            :visibility="data.visibility"
            :disabled="changingVisibility"
            @change="setVisibility"
          />
          <ShareButton
            v-if="data.isOwner || data.visibility === 'public'"
            :path="`${shelfPath}/${list}`"
            :title="title"
            :is-public="data.visibility === 'public'"
            :make-public="() => setVisibility('public')"
          />
          <Button v-if="data.isOwner" as-child>
            <NuxtLink :to="{ path: '/', query: { to: list } }">
              <Plus />
              {{ $t('collection.addGames') }}
            </NuxtLink>
          </Button>
          <Button
            v-if="data.isOwner && ADD_BY_HAND"
            variant="outline"
            @click="addingByHand = true"
          >
            <PenLine />
            <span class="hidden sm:inline">{{
              $t('collection.addByHand')
            }}</span>
            <span class="sr-only sm:hidden">{{
              $t('collection.addByHand')
            }}</span>
          </Button>
          <DropdownMenu v-if="data.isOwner">
            <DropdownMenuTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                :aria-label="$t('lists.actions')"
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-max">
              <DropdownMenuItem @select="editingFields = true">
                <Pencil /> {{ $t('table.editFields') }}
              </DropdownMenuItem>
              <DropdownMenuItem :disabled="exporting" @select="exportCsv">
                <Download /> {{ $t('lists.exportAll', data.itemCount) }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        v-if="!data.itemCount"
        class="rounded-lg border border-dashed py-12 text-center"
      >
        <p class="font-medium">{{ $t('collection.empty') }}</p>
        <template v-if="data.isOwner">
          <p class="mt-1 text-sm text-muted-foreground">
            {{
              list === 'owned'
                ? $t('lists.ownedEmptyHint')
                : $t('lists.wishlistEmptyHint')
            }}
          </p>
          <div
            v-if="!libraryFull"
            class="mt-4 flex flex-wrap justify-center gap-2"
          >
            <Button as-child>
              <NuxtLink :to="{ path: '/', query: { to: list } }">{{
                $t('collection.searchGames')
              }}</NuxtLink>
            </Button>
          </div>
        </template>
      </div>

      <CollectionTable
        v-else
        :fields="data.fields"
        :items="data.items"
        :mode="list"
        :add-targets="data.isOwner ? mine : undefined"
        :server="tableServer"
        :editable="data.isOwner"
        :hidden-columns="data.hiddenColumns"
        :shelf-path="shelfPath"
        @view="onView"
        @hide-columns="saveHiddenColumns"
        @save="saveValue"
        @remove="removeItem"
        @rename="startRenaming"
        @collections-changed="collectionsChanged"
        @platforms-changed="platformsChanged"
        @missing="refresh()"
        @got-it="gotIt"
        @to-wishlist="toWishlist"
      />

      <FieldsEditorDialog
        v-if="data.isOwner"
        v-model:open="editingFields"
        :fields="data.fields"
        @saved="refresh()"
      />
      <AddByHandDialog
        v-if="ADD_BY_HAND && data.isOwner"
        v-model:open="addingByHand"
        :title="title"
        :target="{ list }"
        @added="refresh()"
      />
      <GotItDialog
        v-if="data.isOwner"
        v-model:open="offeringCollections"
        :item-id="gotItItem?.id ?? null"
        :item-name="gotItItem?.name ?? ''"
        :collections="mine"
        :already-in="gotItItem?.inCollections?.map(({ id }) => id)"
        @missing="refresh()"
      />
      <RenameItemDialog
        v-if="data.isOwner"
        v-model:open="renaming"
        :item="renamingItem"
        @saved="onRenamed"
      />
    </template>
  </div>
</template>
