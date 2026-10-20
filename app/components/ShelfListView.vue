<script setup lang="ts">
import { ArrowLeft, Download, Lock, PenLine, Plus } from '@lucide/vue'
import { FetchError } from 'ofetch'
import { toast } from 'vue-sonner'
import { PLAN_LIMITS } from '#shared/utils/plans'
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
  FieldValue,
  ListDetail,
  OwnerEntry,
  LibraryItem,
  ListName,
} from '#shared/types/collection'

/**
 * Owned or the Wishlist at `/u/<username>/shelf/<list>`: the owner's games
 * on that list, as a table with the shared columns only. Only the owner can
 * open it. Everyone else gets the not found page.
 */
const props = defineProps<{ list: ListName }>()

const route = useRoute()
const { t, locale } = useI18n()
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
      }
    : undefined,
)

// Only the Wishlist has a cap of its own. Over it, games can be kept and
// removed but not added.
const capped = computed(() => props.list === 'wishlist')
const count = computed(() => data.value?.itemCount ?? 0)
const overCap = computed(
  () => capped.value && count.value > limits.value.wishlist,
)
const fullCap = computed(
  () => capped.value && count.value >= limits.value.wishlist,
)
const proWishlist = PLAN_LIMITS.pro.wishlist

useHead(() => ({ title: t('app.title', { page: title.value }) }))

// The loaded page is held shallowly, so changes replace it rather than
// editing it in place.
function setItems(items: OwnerEntry[]) {
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
  onNuxtReady(() => void sidebar.load().catch(() => {}))
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

/** Moves an owned game to the Wishlist. It leaves Owned. */
async function toWishlist(itemId: string) {
  if (!(await moves.toWishlist(itemId))) return
  leaveView(itemId)
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
  if (!item) return
  try {
    const saved = await leaving.leave(item, props.list)
    if (!saved) return
    if (!saved.item || !onList(saved.item)) leaveView(itemId)
  } catch {
    toast.error(t('table.removeFailed'))
  }
}

const addingByHand = ref(false)
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
            <span>{{ $t('shelf.gameCount', data.itemCount) }}</span>
            <Badge variant="outline" class="gap-1 text-muted-foreground">
              <Lock class="size-3" aria-hidden="true" />
              {{ $t('lists.onlyYou') }}
            </Badge>
          </div>
          <p class="max-w-prose text-sm text-muted-foreground">
            {{
              list === 'owned'
                ? $t('lists.ownedHint')
                : $t('lists.wishlistHint')
            }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" :disabled="exporting" @click="exportCsv">
            <Download />
            <span class="hidden sm:inline">{{
              $t('lists.exportAll', data.itemCount)
            }}</span>
            <span class="sr-only sm:hidden">{{
              $t('lists.exportAll', data.itemCount)
            }}</span>
          </Button>
          <Button v-if="!fullCap" as-child>
            <NuxtLink :to="{ path: '/', query: { to: list } }">
              <Plus />
              {{ $t('collection.addGames') }}
            </NuxtLink>
          </Button>
          <Button v-else disabled>
            <Plus />
            {{ $t('collection.addGames') }}
          </Button>
          <Button
            variant="outline"
            :disabled="fullCap"
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
        </div>
      </div>

      <Alert v-if="overCap" variant="destructive" data-testid="over-limit">
        <AlertTitle>{{
          $t('limits.overWishlist', {
            used: data.itemCount,
            limit: limits.wishlist,
          })
        }}</AlertTitle>
        <AlertDescription>
          {{ $t('limits.overGamesHelp', { limit: limits.wishlist }) }}
          <NuxtLink v-if="proWishlist > limits.wishlist" to="/pricing">{{
            $t('limits.proAllows', {
              limit: new Intl.NumberFormat(locale).format(proWishlist),
            })
          }}</NuxtLink>
        </AlertDescription>
      </Alert>

      <div
        v-if="!data.itemCount"
        class="rounded-lg border border-dashed py-12 text-center"
      >
        <p class="font-medium">{{ $t('collection.empty') }}</p>
        <p class="mt-1 text-sm text-muted-foreground">
          {{
            list === 'owned'
              ? $t('lists.ownedEmptyHint')
              : $t('lists.wishlistEmptyHint')
          }}
        </p>
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          <Button as-child>
            <NuxtLink :to="{ path: '/', query: { to: list } }">{{
              $t('collection.searchGames')
            }}</NuxtLink>
          </Button>
        </div>
      </div>

      <CollectionTable
        v-else
        :fields="data.fields"
        :items="data.items"
        :mode="list"
        :add-targets="mine"
        :server="tableServer"
        editable
        :shelf-path="shelfPath"
        @view="onView"
        @save="saveValue"
        @remove="removeItem"
        @rename="startRenaming"
        @collections-changed="collectionsChanged"
        @missing="refresh()"
        @got-it="gotIt"
        @to-wishlist="toWishlist"
      />

      <AddByHandDialog
        v-model:open="addingByHand"
        :title="title"
        :target="{ list }"
        @added="refresh()"
      />
      <GotItDialog
        v-model:open="offeringCollections"
        :item-id="gotItItem?.id ?? null"
        :item-name="gotItItem?.name ?? ''"
        :collections="mine"
        :already-in="gotItItem?.inCollections?.map(({ id }) => id)"
        @missing="refresh()"
      />
      <RenameItemDialog
        v-model:open="renaming"
        :item="renamingItem"
        @saved="onRenamed"
      />
    </template>
  </div>
</template>
