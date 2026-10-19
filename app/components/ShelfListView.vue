<script setup lang="ts">
import { ArrowLeft, Lock, PenLine, Plus } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { PLAN_LIMITS } from '#shared/utils/plans'
import type {
  CollectionEntry,
  CollectionLink,
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

const { data, status, error, refresh } = useAsyncData(
  () => `list-${username.value}-${props.list}`,
  () => collections.getList(username.value, props.list),
  { watch: [username, () => props.list] },
)
const notFound = computed(() => error.value?.statusCode === 404)

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

// The loaded list is held shallowly, so changes replace it rather than
// editing it in place.
function setItems(items: OwnerEntry[]) {
  if (!data.value) return
  data.value = { ...data.value, items, itemCount: items.length }
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
  setItems((data.value?.items ?? []).filter((entry) => entry.id !== itemId))
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
}

/** Moves an owned game to the Wishlist. It leaves Owned. */
async function toWishlist(itemId: string) {
  if (!(await moves.toWishlist(itemId))) return
  setItems((data.value?.items ?? []).filter((entry) => entry.id !== itemId))
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
    if (!saved.item || !onList(saved.item)) {
      setItems((data.value?.items ?? []).filter((entry) => entry.id !== itemId))
    }
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
        v-if="!data.items.length"
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
        :fields="[]"
        :items="data.items"
        :mode="list"
        :add-targets="mine"
        editable
        :shelf-path="shelfPath"
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
