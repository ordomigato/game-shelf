<script setup lang="ts">
import {
  ArrowLeft,
  Columns3,
  Ellipsis,
  Heart,
  LayoutGrid,
  Lock,
  Pencil,
  Plus,
  Table2,
  Trash2,
} from '@lucide/vue'
import { VueDraggable } from 'vue-draggable-plus'
import { toast } from 'vue-sonner'
import type {
  CollectionEntry,
  CollectionSummary,
  FieldValue,
  ItemData,
  LibraryItem,
} from '#shared/types/collection'

const NuxtLink = resolveComponent('NuxtLink')
const route = useRoute()
const { t } = useI18n()
const collections = useCollections()
const titleOf = useCollectionTitle()

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
    ? t('app.title', { page: titleOf(data.value) })
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

// Table or covers, remembered on this device.
const VIEW_KEY = 'gameshelf:collection-view'
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
  } catch {
    setItemData(itemId, before)
    toast.error(t('table.saveFailed'))
  }
}

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

// The owner's other collections, for "Got it" and "Move to".
const mine = ref<CollectionSummary[]>([])
watch(
  () => data.value?.isOwner,
  async (isOwner) => {
    if (!isOwner || mine.value.length) return
    try {
      mine.value = await collections.mine()
    } catch {
      // The menu just shows no collections to move to.
    }
  },
  { immediate: true },
)
const moveTargets = computed(() =>
  mine.value.filter((collection) => collection.id !== data.value?.id),
)

/** Takes a game out of this collection into another, with a toast. */
async function moveToCollection(itemId: string, collectionId: string) {
  const target = mine.value.find((collection) => collection.id === collectionId)
  if (!data.value || !target) return
  const fromId = data.value.id
  const before = data.value.items
  setItems(before.filter((entry) => entry.id !== itemId))
  try {
    await collections.moveToCollections(fromId, itemId, [collectionId])
    toast.success(t('table.movedTo', { collection: titleOf(target) }), {
      action: {
        label: t('table.view'),
        onClick: () => navigateTo(`${shelfPath.value}/${target.slug}`),
      },
    })
  } catch {
    setItems(before)
    toast.error(t('table.moveToFailed'))
  }
}

/** Puts a game on the Wishlist or takes it off, from another collection. */
async function toggleWishlist(itemId: string, on: boolean) {
  const wishlist = mine.value.find(
    (collection) => collection.kind === 'wishlist',
  )
  if (!data.value || !wishlist) return
  const mark = (wishlisted: boolean) =>
    setItems(
      (data.value?.items ?? []).map((entry) =>
        entry.id === itemId ? { ...entry, wishlisted } : entry,
      ),
    )
  mark(on)
  try {
    if (on) await collections.addItem(wishlist.id, itemId)
    else await collections.removeItem(wishlist.id, itemId)
  } catch {
    mark(!on)
    toast.error(t('table.wishlistFailed'))
  }
}

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
          <h1 class="flex items-center gap-2 text-3xl font-bold">
            <Heart
              v-if="data.kind === 'wishlist'"
              class="size-6 text-primary"
              aria-hidden="true"
            />
            {{ titleOf(data) }}
          </h1>
          <div
            class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <span>{{ $t('shelf.gameCount', data.itemCount) }}</span>
            <Badge
              v-if="data.isOwner && data.visibility === 'private'"
              variant="outline"
              class="gap-1"
            >
              <Lock class="size-3" aria-hidden="true" />
              {{ $t('shelf.private') }}
            </Badge>
            <Badge v-else-if="data.isOwner" variant="secondary">
              {{ $t('shelf.public') }}
            </Badge>
          </div>
          <p v-if="data.description" class="max-w-prose whitespace-pre-line">
            {{ data.description }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{
              data.blueprint.fields.length
                ? $t('collection.columns', {
                    fields: data.blueprint.fields
                      .map((field) => field.name)
                      .join(', '),
                  })
                : $t('collection.noColumns')
            }}
            <button
              v-if="data.isOwner"
              type="button"
              class="ml-1 font-medium text-primary underline-offset-4 hover:underline"
              @click="editingFields = true"
            >
              {{ $t('collection.editFields') }}
            </button>
          </p>
        </div>

        <div v-if="data.isOwner" class="flex items-center gap-2">
          <Button v-if="data.items.length" as-child>
            <NuxtLink :to="{ path: '/', query: { to: data.slug } }">
              <Plus />
              {{ $t('collection.addGames') }}
            </NuxtLink>
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
            <DropdownMenuContent align="end">
              <DropdownMenuItem @select="editing = true">
                <Pencil /> {{ $t('collection.edit') }}
              </DropdownMenuItem>
              <DropdownMenuItem @select="editingFields = true">
                <Columns3 /> {{ $t('collection.editFields') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="data.kind !== 'wishlist'"
                class="text-destructive focus:text-destructive"
                @select="confirmingDelete = true"
              >
                <Trash2 /> {{ $t('collection.delete') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        v-if="!data.items.length"
        class="rounded-lg border border-dashed py-12 text-center"
      >
        <p class="font-medium">{{ $t('collection.empty') }}</p>
        <template v-if="data.isOwner">
          <p class="mt-1 text-sm text-muted-foreground">
            {{ $t('collection.emptyHint') }}
          </p>
          <Button as-child class="mt-4">
            <NuxtLink :to="{ path: '/', query: { to: data.slug } }">{{
              $t('collection.searchGames')
            }}</NuxtLink>
          </Button>
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
          </ToggleGroup>
        </div>

        <CollectionTable
          v-if="view === 'table'"
          :fields="data.blueprint.fields"
          :items="data.items"
          :editable="data.isOwner"
          :move-targets="moveTargets"
          :is-wishlist="data.kind === 'wishlist'"
          @save="saveValue"
          @remove="removeItem"
          @move="moveItem"
          @rename="startRenaming"
          @move-to="moveToCollection"
          @wishlist="toggleWishlist"
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
            :class="{ 'is-wishlisted': item.wishlisted }"
          >
            <component
              :is="item.igdbId ? NuxtLink : 'div'"
              :to="item.igdbId ? `/games/${item.igdbId}` : undefined"
              class="wishlist-fade group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GameCover :name="item.name" :cover-id="item.coverId" />
              <span
                class="line-clamp-2 text-sm font-semibold"
                :class="{ 'group-hover:underline': item.igdbId }"
              >
                {{ item.name }}
              </span>
            </component>
            <span
              v-if="item.wishlisted"
              class="pointer-events-none absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-card/95 text-primary shadow-md"
            >
              <Heart class="size-4 fill-current" aria-hidden="true" />
              <span class="sr-only">{{ $t('table.wishlisted') }}</span>
            </span>
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

      <RenameItemDialog
        v-if="data.isOwner"
        v-model:open="renaming"
        :item="renamingItem"
        @saved="onRenamed"
      />
      <FieldsEditorDialog
        v-if="data.isOwner"
        v-model:open="editingFields"
        :collection-id="data.id"
        :fields="data.blueprint.fields"
        :items="data.items"
        @saved="refresh()"
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
              $t('collection.deleteTitle', { title: titleOf(data) })
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
