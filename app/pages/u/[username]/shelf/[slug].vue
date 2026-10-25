<script setup lang="ts">
import {
  ArrowLeft,
  ChartColumn,
  Download,
  Ellipsis,
  LayoutGrid,
  PenLine,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Table2,
  Trash2,
  Upload,
} from '@lucide/vue'
import { VueDraggable } from 'vue-draggable-plus'
import { collectionCsv, FIXED_COLUMNS } from '#shared/utils/csv'
import { PLAN_LIMITS } from '#shared/utils/plans'
import { toast } from 'vue-sonner'
import type {
  CollectionEntry,
  CollectionLink,
  CollectionSummary,
  FieldDefinition,
  FieldValue,
  ItemData,
  LibraryItem,
} from '#shared/types/collection'

const NuxtLink = resolveComponent('NuxtLink')
const route = useRoute()
const { t, n, locale } = useI18n()
const { limits } = usePlan()
const proGames = PLAN_LIMITS.pro.gamesPerCollection
// Over the limit, games can be kept and removed but not added.
const overGames = computed(
  () => (data.value?.itemCount ?? 0) > limits.value.gamesPerCollection,
)
const { full: libraryFull } = useLibraryRoom({ load: true })
// Adding is off when the collection or the whole library is full.
const fullGames = computed(
  () =>
    (data.value?.itemCount ?? 0) >= limits.value.gamesPerCollection ||
    libraryFull.value,
)
const existingIgdbIds = computed(() =>
  (data.value?.items ?? []).flatMap((item) =>
    item.igdbId === null ? [] : [item.igdbId],
  ),
)
const roomLeft = computed(() =>
  Math.max(0, limits.value.gamesPerCollection - (data.value?.itemCount ?? 0)),
)
const collections = useCollections()

const username = computed(() => String(route.params.username).toLowerCase())
const slug = computed(() => String(route.params.slug))
const shelfPath = computed(() => `/u/${username.value}/shelf`)

const { data, status, error, refresh } = useAsyncData(
  () => `collection-${username.value}-${slug.value}`,
  () => collections.get(username.value, slug.value),
  { watch: [username, slug] },
)

const notFound = computed(() => error.value?.statusCode === 404)
const shelfName = computed(() =>
  collections.isMine(username.value)
    ? t('shelf.myTitle')
    : t('shelf.userTitle', { username: username.value }),
)

useHead(() => ({
  title: data.value
    ? t('app.title', { page: data.value.title })
    : t('app.title', { page: shelfName.value }),
}))

const editing = ref(false)
const editingFields = ref(false)
const confirmingDelete = ref(false)
const deleting = ref(false)

async function onSaved(saved: CollectionSummary) {
  if (saved.slug !== slug.value) {
    await navigateTo(`${shelfPath.value}/${saved.slug}`, { replace: true })
  } else {
    await refresh()
  }
}

// Table or covers, remembered on this device. Charts have their own link
// (?view=charts), so a dashboard can be shared.
const VIEW_KEY = 'gameshelf:collection-view'
type View = 'table' | 'covers' | 'charts'
const savedView = ref<'table' | 'covers'>('table')
onMounted(() => {
  try {
    if (localStorage.getItem(VIEW_KEY) === 'covers') savedView.value = 'covers'
  } catch {
    // Storage can be blocked. The table is a fine default.
  }
})
const view = computed<View>(() =>
  route.query.view === 'charts' ? 'charts' : savedView.value,
)
function chooseView(value: unknown) {
  if (value !== 'table' && value !== 'covers' && value !== 'charts') return
  const { view: _old, ...query } = route.query
  void navigateTo(
    { query: value === 'charts' ? { ...query, view: 'charts' } : query },
    { replace: true },
  )
  if (value === 'charts') return
  savedView.value = value
  try {
    localStorage.setItem(VIEW_KEY, value)
  } catch {
    // Not remembered, which is fine.
  }
}

/** Saves the dashboard, showing the change straight away. */
async function saveDashboard(dashboard: ChartWidget[]) {
  if (!data.value) return
  const before = data.value.dashboard
  data.value = { ...data.value, dashboard }
  try {
    await collections.saveDashboard(data.value.id, dashboard)
  } catch (error) {
    if (data.value) data.value = { ...data.value, dashboard: before }
    toast.error(limitMessage(error, t) ?? t('charts.saveFailed'))
  }
}

/** Saves the hidden columns, showing the change straight away. */
async function saveHiddenColumns(hiddenColumns: string[]) {
  if (!data.value) return
  const before = data.value.hiddenColumns
  data.value = { ...data.value, hiddenColumns }
  try {
    await collections.saveHiddenColumns(data.value.id, hiddenColumns)
  } catch {
    if (data.value) data.value = { ...data.value, hiddenColumns: before }
    toast.error(t('table.columnsSaveFailed'))
  }
}

// The covers view grows by a batch at a time instead of drawing every cover.
const COVER_BATCH = 60
const coverLimit = ref(COVER_BATCH)

// The loaded collection is held shallowly, so changes replace it rather
// than editing it in place.
function setItems(items: CollectionEntry[]) {
  if (!data.value) return
  data.value = { ...data.value, items, itemCount: items.length }
}

function setItemData(itemId: string, itemData: ItemData) {
  setItems(
    (data.value?.items ?? []).map((entry) =>
      entry.id === itemId ? { ...entry, data: itemData } : entry,
    ),
  )
}

/** Saves one value straight away in the table, undoing it if saving fails. */
async function saveValue(
  itemId: string,
  fieldId: string,
  value: FieldValue | null,
) {
  const item = data.value?.items.find((entry) => entry.id === itemId)
  if (!data.value || !item) return
  const before = item.data
  setItemData(
    itemId,
    value === null
      ? Object.fromEntries(
          Object.entries(before).filter(([id]) => id !== fieldId),
        )
      : { ...before, [fieldId]: value },
  )
  try {
    const saved = await collections.updateValues(data.value.id, itemId, {
      [fieldId]: value,
    })
    setItemData(itemId, saved.data)
  } catch (error) {
    setItemData(itemId, before)
    toast.error(limitMessage(error, t) ?? t('table.saveFailed'))
  }
}

const addingByHand = ref(false)
const importing = ref(false)
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
}

// The owner's collections, from the same list the sidebar uses: for "Got
// it", "Add to" and pinning. Phones have no sidebar, so load the list here
// if nothing has yet.
const sidebar = useMyCollections()
const mine = computed(() => sidebar.list.value ?? [])
watch(
  () => data.value?.isOwner,
  (isOwner) => {
    // Without it, the menus just show no collections to add to.
    if (isOwner) sidebar.load().catch(() => {})
  },
  { immediate: true },
)
/**
 * Shows the collections a game is in after they were saved. Leaving this
 * collection takes the game's row off the page.
 */
function collectionsChanged(itemId: string, links: CollectionLink[]) {
  if (!data.value) return
  const stays = links.some((link) => link.id === data.value?.id)
  setItems(
    stays
      ? data.value.items.map((entry) =>
          entry.id === itemId ? { ...entry, inCollections: links } : entry,
        )
      : data.value.items.filter((entry) => entry.id !== itemId),
  )
}

const gotItItem = ref<CollectionEntry | null>(null)
const offeringCollections = ref(false)

/** Puts a game's new place on the lists into the table. */
function applyLists(saved: LibraryItem) {
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
}

const moves = useListMoves(shelfPath)

/**
 * The owner has a wanted game now. Then, if there are collections it isn't
 * in yet, offers to add it to some of them.
 */
async function gotIt(itemId: string) {
  const item = data.value?.items.find((entry) => entry.id === itemId)
  const saved = await moves.gotIt(itemId)
  if (!saved || !item) return
  applyLists(saved)
  const alreadyIn = item.inCollections?.map(({ id }) => id) ?? []
  // The list may still be loading, or have failed to when the page opened.
  const owned = await sidebar.load().catch(() => mine.value)
  if (owned.some(({ id }) => !alreadyIn.includes(id))) {
    gotItItem.value = item
    offeringCollections.value = true
  }
}

/** Moves a game the owner no longer has to the Wishlist. */
async function toWishlist(itemId: string) {
  const saved = await moves.toWishlist(itemId)
  if (saved) applyLists(saved)
}

/** Takes a game out of this collection. It stays on its lists. */
async function removeItem(itemId: string) {
  if (!data.value) return
  const collectionId = data.value.id
  const before = data.value.items
  setItems(before.filter((entry) => entry.id !== itemId))
  try {
    await collections.removeItem(collectionId, itemId)
  } catch {
    setItems(before)
    toast.error(t('table.removeFailed'))
  }
}

/** Puts a game in its new place straight away, undoing it if saving fails. */
async function moveItem(itemId: string, afterItemId: string | null) {
  if (!data.value) return
  const collectionId = data.value.id
  const before = data.value.items
  setItems(moveAfter(before, itemId, afterItemId))
  try {
    await collections.moveItem(collectionId, itemId, afterItemId)
  } catch {
    setItems(before)
    toast.error(t('table.moveFailed'))
  }
}

// The covers view as a list the drag-and-drop can rearrange.
const coverItems = ref<CollectionEntry[]>([])
watch(
  () => data.value?.items.slice(0, coverLimit.value) ?? [],
  (items) => {
    coverItems.value = items
  },
  { immediate: true },
)

function onCoverDragged(event: { oldIndex?: number; newIndex?: number }) {
  const { oldIndex, newIndex } = event
  const items = data.value?.items ?? []
  const moved = oldIndex === undefined ? undefined : items[oldIndex]
  if (moved && newIndex !== undefined && oldIndex !== newIndex) {
    void moveItem(moved.id, afterIdForIndex(items, moved.id, newIndex))
  }
  coverItems.value = (data.value?.items ?? []).slice(0, coverLimit.value)
}

/** Takes the fields the editor saved, and reloads the games' values. */
function onFieldsSaved(fields: FieldDefinition[]) {
  if (data.value) data.value = { ...data.value, fields }
  void refresh()
}

const sidebarEntry = computed(
  () => mine.value.find((entry) => entry.id === data.value?.id) ?? null,
)
function togglePin() {
  const entry = sidebarEntry.value
  if (!entry) return
  if (entry.pinnedPosition == null) void sidebar.pin(entry)
  else void sidebar.unpin(entry)
}

/**
 * Downloads this collection as a CSV file, built right here from the games
 * already on the page.
 */
function exportCsv() {
  if (!data.value) return
  const csv = collectionCsv(
    data.value.fields,
    data.value.items,
    FIXED_COLUMNS.map((column) => t(column.key)),
  )
  saveFile(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `${data.value.slug}.csv`,
  )
}

const changingVisibility = ref(false)

/** Makes the collection private or public. Resolves whether it worked. */
async function setVisibility(visibility: CollectionVisibility) {
  if (!data.value) return false
  changingVisibility.value = true
  try {
    const saved = await collections.update(data.value.id, { visibility })
    data.value = { ...data.value, visibility: saved.visibility }
    toast.success(
      visibility === 'public'
        ? t('visibility.nowPublic')
        : t('visibility.nowPrivate'),
    )
    return true
  } catch {
    toast.error(t('visibility.failed'))
    return false
  } finally {
    changingVisibility.value = false
  }
}

async function deleteCollection() {
  if (!data.value) return
  deleting.value = true
  try {
    await collections.remove(data.value.id)
    await navigateTo(shelfPath.value)
  } catch {
    toast.error(t('collection.deleteFailed'))
  } finally {
    deleting.value = false
  }
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
      v-else-if="status === 'pending' && !data"
      class="flex flex-col gap-4"
      aria-hidden="true"
    >
      <Skeleton class="h-9 w-64" />
      <Skeleton class="h-5 w-96 max-w-full" />
    </div>

    <div v-else-if="error" class="py-12 text-center">
      <p class="text-lg font-medium">{{ $t('collection.loadFailed') }}</p>
      <Button class="mt-4" @click="refresh()">{{ $t('shelf.retry') }}</Button>
    </div>

    <template v-else-if="data">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex flex-col gap-2">
          <h1 class="text-3xl font-bold">{{ data.title }}</h1>
          <div
            class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <span
              v-if="data.isOwner"
              :class="{
                'font-medium text-destructive':
                  data.itemCount > limits.gamesPerCollection,
              }"
              >{{
                $t('limits.gamesUsed', {
                  used: n(data.itemCount),
                  limit: n(limits.gamesPerCollection),
                })
              }}</span
            >
            <span v-else>{{ $t('shelf.gameCount', data.itemCount) }}</span>
          </div>
          <p
            v-if="data.isOwner && libraryFull"
            class="text-sm font-medium text-destructive"
            data-testid="library-full"
          >
            {{ $t('limits.libraryFull') }}
          </p>
          <p v-if="data.description" class="max-w-prose whitespace-pre-line">
            {{ data.description }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <VisibilityMenu
            v-if="data.isOwner"
            :visibility="data.visibility"
            :disabled="changingVisibility"
            @change="setVisibility"
          />
          <ShareButton
            v-if="data.isOwner || data.visibility === 'public'"
            :path="`${shelfPath}/${data.slug}`"
            :title="data.title"
            :is-public="data.visibility === 'public'"
            :make-public="() => setVisibility('public')"
          />
          <template v-if="data.isOwner">
            <Button v-if="data.items.length && !fullGames" as-child>
              <NuxtLink :to="{ path: '/', query: { to: data.slug } }">
                <Plus />
                {{ $t('collection.addGames') }}
              </NuxtLink>
            </Button>
            <Button v-else-if="data.items.length" disabled>
              <Plus />
              {{ $t('collection.addGames') }}
            </Button>
            <ScanButton
              v-if="data.items.length"
              :collection="{ id: data.id, title: data.title }"
            />
            <Button
              v-if="ADD_BY_HAND && data.items.length"
              variant="outline"
              :disabled="fullGames"
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
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="outline"
                  size="icon"
                  :aria-label="$t('collection.actions')"
                >
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-max">
                <DropdownMenuItem @select="editing = true">
                  <Pencil /> {{ $t('collection.edit') }}
                </DropdownMenuItem>
                <DropdownMenuItem v-if="sidebarEntry" @select="togglePin">
                  <template v-if="sidebarEntry.pinnedPosition == null">
                    <Pin /> {{ $t('collection.pin') }}
                  </template>
                  <template v-else>
                    <PinOff /> {{ $t('collection.unpin') }}
                  </template>
                </DropdownMenuItem>
                <DropdownMenuItem @select="editingFields = true">
                  <Pencil /> {{ $t('collection.editFields') }}
                </DropdownMenuItem>
                <DropdownMenuItem @select="importing = true">
                  <Upload /> {{ $t('collection.importCsv') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  :disabled="!data.items.length"
                  @select="exportCsv"
                >
                  <Download /> {{ $t('collection.exportCsv') }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  @select="confirmingDelete = true"
                >
                  <Trash2 /> {{ $t('collection.delete') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </template>
        </div>
      </div>

      <Alert
        v-if="data.isOwner && overGames"
        variant="destructive"
        data-testid="over-limit"
      >
        <AlertTitle>{{
          $t('limits.overCollection', {
            used: data.itemCount,
            limit: limits.gamesPerCollection,
          })
        }}</AlertTitle>
        <AlertDescription>
          {{ $t('limits.overGamesHelp', { limit: limits.gamesPerCollection }) }}
          <NuxtLink v-if="proGames > limits.gamesPerCollection" to="/pricing">{{
            $t('limits.proAllows', {
              limit: new Intl.NumberFormat(locale).format(proGames),
            })
          }}</NuxtLink>
        </AlertDescription>
      </Alert>

      <div
        v-if="!data.items.length"
        class="rounded-lg border border-dashed py-12 text-center"
      >
        <p class="font-medium">{{ $t('collection.empty') }}</p>
        <template v-if="data.isOwner">
          <p class="mt-1 text-sm text-muted-foreground">
            {{ $t('collection.emptyHint') }}
          </p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <Button as-child>
              <NuxtLink :to="{ path: '/', query: { to: data.slug } }">{{
                $t('collection.searchGames')
              }}</NuxtLink>
            </Button>
            <ScanButton :collection="{ id: data.id, title: data.title }" />
            <Button
              v-if="ADD_BY_HAND"
              variant="outline"
              @click="addingByHand = true"
            >
              <PenLine /> {{ $t('collection.addByHand') }}
            </Button>
          </div>
        </template>
      </div>

      <template v-else>
        <div class="flex items-center justify-between gap-4">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            class="ml-auto"
            :model-value="view"
            :aria-label="$t('collection.view')"
            @update:model-value="chooseView"
          >
            <ToggleGroupItem value="table" :aria-label="$t('collection.table')">
              <Table2 aria-hidden="true" />
              <span class="hidden sm:inline">{{ $t('collection.table') }}</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="covers"
              :aria-label="$t('collection.covers')"
            >
              <LayoutGrid aria-hidden="true" />
              <span class="hidden sm:inline">{{
                $t('collection.covers')
              }}</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="charts"
              :aria-label="$t('collection.charts')"
            >
              <ChartColumn aria-hidden="true" />
              <span class="hidden sm:inline">{{
                $t('collection.charts')
              }}</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <CollectionTable
          v-if="view === 'table'"
          :fields="data.fields"
          :items="data.items"
          :editable="data.isOwner"
          :hidden-columns="data.hiddenColumns"
          :add-targets="mine"
          :shelf-path="shelfPath"
          @hide-columns="saveHiddenColumns"
          @save="saveValue"
          @remove="removeItem"
          @move="moveItem"
          @rename="startRenaming"
          @collections-changed="collectionsChanged"
          @platforms-changed="applyLists"
          @missing="refresh()"
          @got-it="gotIt"
          @to-wishlist="toWishlist"
        />

        <ChartsDashboard
          v-else-if="view === 'charts'"
          :dashboard="data.dashboard"
          :fields="data.fields"
          :items="data.items"
          :editable="data.isOwner"
          @save="saveDashboard"
        />

        <VueDraggable
          v-else
          v-model="coverItems"
          tag="ul"
          :disabled="!data.isOwner"
          ghost-class="drag-gap"
          :animation="150"
          :delay="250"
          :delay-on-touch-only="true"
          class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
          @update="onCoverDragged"
        >
          <li
            v-for="item in coverItems"
            :key="item.id"
            class="relative"
            :class="{ 'is-wanted': item.wanted && item.owned === false }"
          >
            <component
              :is="item.igdbId ? NuxtLink : 'div'"
              :to="item.igdbId ? `/games/${item.igdbId}` : undefined"
              class="wanted-fade group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GameCover :name="item.name" :cover-id="item.coverId" />
              <span
                class="line-clamp-2 text-sm font-semibold"
                :class="{ 'group-hover:underline': item.igdbId }"
              >
                {{ item.name }}
              </span>
            </component>
            <Badge
              v-if="item.wanted"
              variant="secondary"
              class="pointer-events-none absolute top-2 right-2 shadow-md"
            >
              {{ $t('table.wishlist') }}
            </Badge>
          </li>
        </VueDraggable>
        <div
          v-if="view === 'covers' && data.items.length > coverLimit"
          class="text-center"
        >
          <Button variant="outline" @click="coverLimit += COVER_BATCH">
            {{ $t('collection.showMore') }}
          </Button>
        </div>
      </template>

      <ImportDialog
        v-if="data.isOwner"
        v-model:open="importing"
        :collection-id="data.id"
        :fields="data.fields"
        :room="roomLeft"
        :existing-igdb-ids="existingIgdbIds"
        @imported="refresh()"
      />
      <AddByHandDialog
        v-if="ADD_BY_HAND && data.isOwner"
        v-model:open="addingByHand"
        :title="data.title"
        :target="{ collectionId: data.id }"
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
      <FieldsEditorDialog
        v-if="data.isOwner"
        v-model:open="editingFields"
        :fields="data.fields"
        @saved="onFieldsSaved"
      />
      <CollectionFormDialog
        v-if="data.isOwner"
        v-model:open="editing"
        :collection="data"
        @saved="onSaved"
      />
      <AlertDialog v-model:open="confirmingDelete">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{{
              $t('collection.deleteTitle', { title: data.title })
            }}</AlertDialogTitle>
            <AlertDialogDescription>{{
              $t('collection.deleteBody')
            }}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{{ $t('collection.cancel') }}</AlertDialogCancel>
            <AlertDialogAction
              class="bg-destructive text-white hover:bg-destructive/90"
              :disabled="deleting"
              @click="deleteCollection"
            >
              {{ $t('collection.deleteConfirm') }}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </template>
  </div>
</template>
