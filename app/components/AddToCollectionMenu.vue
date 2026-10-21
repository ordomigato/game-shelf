<script setup lang="ts">
import { CircleCheck, CirclePlus, Plus } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type {
  CollectionSummary,
  LibraryItem,
  ListName,
} from '#shared/types/collection'

/**
 * The "Add to collection" menu for an IGDB game: Owned and the Wishlist
 * first, then every one of the user's collections as checkboxes. Each tick
 * saves straight away and the menu stays open. A game is one library item
 * however many places it's in, so the first tick creates the item and later ticks only change it.
 * Ticking a collection for a new game makes it owned, and ticking one for
 * a game already there leaves its lists alone. When the catalog knows the
 * game's platforms, "Owned on" and "Wishlisted on" let the user say which
 * version they have or want. The collections come from the sidebar's list
 * and the game's state is remembered, so opening the menu again doesn't
 * ask the server again. A game the library doesn't have yet needs room in
 * it, so when the library is full every tick is disabled and says Full
 * until the game is there.
 */
const props = withDefaults(
  defineProps<{
    game: { igdbId: number; name: string; coverId: string | null }
    /** `icon` for a small button over a search result's cover. */
    variant?: 'icon' | 'button'
  }>(),
  { variant: 'button' },
)
/** Whether the game is on a list. Drives the trigger. */
const tracked = defineModel<boolean>('tracked', { default: false })

const { t } = useI18n()
const auth = useAuth()
const route = useRoute()
const { limits } = usePlan()
const collections = useCollections()
const myCollections = useMyCollections()
const leaving = useUnownConfirm()
const { full: libraryFull } = useLibraryRoom()

const open = ref(false)
const loading = ref(false)
const error = ref('')
const customCollections = computed(() => myCollections.list.value ?? [])
const item = ref<LibraryItem | null>(null)
const platforms = ref<{ id: number; name: string }[]>([])
const selected = ref(new Set<string>())
const saving = ref(new Set<string>())
const creating = ref(false)
// Each save sends the whole set of collections, so none can change while one
// is being saved.
const collectionsBusy = computed(() =>
  customCollections.value.some((collection) => saving.value.has(collection.id)),
)

// Adding a new game, to any list or collection, takes room in the library.
const noRoom = computed(() => libraryFull.value && item.value === null)

const label = computed(() =>
  tracked.value
    ? t('addToCollection.inCollections')
    : t('addToCollection.button'),
)

async function onOpenChange(value: boolean) {
  if (!value) {
    open.value = false
    return
  }
  await auth.ensureLoaded()
  if (auth.status.value !== 'signedIn') {
    await navigateTo({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  open.value = true
  await load()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [, , membership] = await Promise.all([
      myCollections.load(),
      myCollections.loadCounts(),
      collections.membership(props.game.igdbId),
    ])
    platforms.value = membership.platforms ?? []
    show(membership.item, membership.collectionIds)
  } catch {
    error.value = t('addToCollection.loadFailed')
  } finally {
    loading.value = false
  }
}

function show(next: LibraryItem | null, collectionIds: string[]) {
  item.value = next
  selected.value = new Set(collectionIds)
  tracked.value = next !== null
}

/** Runs one change, keyed so its checkbox is disabled until it's saved. */
async function save(key: string, change: () => Promise<void>) {
  if (saving.value.has(key)) return
  saving.value = new Set(saving.value).add(key)
  error.value = ''
  try {
    await change()
  } catch (error) {
    toast.error(limitMessage(error, t) ?? t('addToCollection.saveFailed'))
    // A collection deleted elsewhere: show the ones that are left.
    if (isNotFound(error)) {
      await myCollections.refresh()
      await load()
    }
  } finally {
    const done = new Set(saving.value)
    done.delete(key)
    saving.value = done
  }
}

function toggleList(list: ListName, checked: boolean) {
  return save(list, async () => {
    if (checked) {
      if (item.value) {
        const saved = await collections.changeLists(item.value.id, {
          type: list === 'owned' ? 'own' : 'want',
        })
        show(saved.item, saved.collectionIds)
      } else {
        const added = await collections.addGame(props.game, [], { list })
        show(added.item, added.collectionIds)
      }
      return
    }
    if (!item.value) return
    const saved = await leaving.leave(item.value, list)
    if (saved) show(saved.item, saved.collectionIds)
  })
}

const {
  ownedOn,
  wantedOn,
  toggle: togglePlatform,
} = usePlatformToggle(
  () => item.value,
  async (list, next) => {
    if (item.value) {
      const saved = await collections.changeLists(item.value.id, {
        type: list === 'owned' ? 'setOwnedOn' : 'setWantedOn',
        platforms: next,
      })
      show(saved.item, saved.collectionIds)
      return saved.item
    }
    const added = await collections.addGame(props.game, [], {
      list,
      platforms: next,
    })
    show(added.item, added.collectionIds)
    return added.item
  },
)

function toggleCollection(collection: CollectionSummary, checked: boolean) {
  return save(collection.id, async () => {
    if (!item.value) {
      if (!checked) return
      const added = await collections.addGame(props.game, [collection.id])
      show(added.item, added.collectionIds)
      return
    }
    const saved = await collections.setItemCollections(item.value.id, {
      add: checked ? [collection.id] : [],
      remove: checked ? [] : [collection.id],
    })
    show(item.value, saved.collectionIds)
  })
}

/** A full collection can't take this game, though it can keep it. */
const isFull = (collection: CollectionSummary) =>
  noRoom.value ||
  collectionFullFor(
    collection,
    limits.value.gamesPerCollection,
    selected.value.has(collection.id),
  )

function startCreating() {
  open.value = false
  creating.value = true
}

async function onCreated(collection: CollectionSummary) {
  // A new collection is made either way, but a game with no room stays out.
  if (!noRoom.value) await toggleCollection(collection, true)
}
</script>

<template>
  <DropdownMenu :open="open" @update:open="onOpenChange">
    <DropdownMenuTrigger as-child>
      <CoverActionButton
        v-if="variant === 'icon'"
        :state="tracked ? 'have' : 'add'"
        :label="`${label}: ${game.name}`"
      />
      <Button v-else :variant="tracked ? 'outline' : 'default'">
        <CircleCheck v-if="tracked" />
        <CirclePlus v-else />
        {{ label }}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-64">
      <DropdownMenuLabel>{{ $t('addToCollection.heading') }}</DropdownMenuLabel>
      <p v-if="loading" class="px-2 py-1.5 text-sm text-muted-foreground">
        {{ $t('addToCollection.loading') }}
      </p>
      <template v-else>
        <DropdownMenuCheckboxItem
          :model-value="item?.owned === true"
          :disabled="saving.has('owned') || noRoom"
          @update:model-value="toggleList('owned', $event === true)"
          @select.prevent
        >
          {{ $t('shelf.owned') }}
          <span
            v-if="noRoom"
            class="ml-auto pl-2 text-xs text-muted-foreground"
            >{{ $t('addToCollection.full') }}</span
          >
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          :model-value="item?.wishlisted === true"
          :disabled="saving.has('wishlist') || noRoom"
          @update:model-value="toggleList('wishlist', $event === true)"
          @select.prevent
        >
          {{ $t('shelf.wishlist') }}
          <span
            v-if="noRoom"
            class="ml-auto pl-2 text-xs text-muted-foreground"
            >{{ $t('addToCollection.full') }}</span
          >
        </DropdownMenuCheckboxItem>
        <template v-if="platforms.length">
          <DropdownMenuSub
            v-for="list in ['owned', 'wishlist'] as const"
            :key="list"
          >
            <DropdownMenuSubTrigger :disabled="noRoom">
              {{
                list === 'owned'
                  ? $t('addToCollection.ownedOn')
                  : $t('addToCollection.wantedOn')
              }}
              <span v-if="noRoom" class="text-xs text-muted-foreground">{{
                $t('addToCollection.full')
              }}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent class="max-h-72 w-56 overflow-y-auto">
              <DropdownMenuCheckboxItem
                v-for="platform in platforms"
                :key="platform.id"
                class="min-h-10"
                :model-value="
                  (list === 'owned' ? ownedOn : wantedOn).includes(platform.id)
                "
                @update:model-value="
                  togglePlatform(list, platform.id, $event === true)
                "
                @select.prevent
              >
                <span class="truncate">{{ platform.name }}</span>
              </DropdownMenuCheckboxItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </template>
        <DropdownMenuSeparator v-if="customCollections.length" />
        <DropdownMenuCheckboxItem
          v-for="collection in customCollections"
          :key="collection.id"
          :model-value="selected.has(collection.id)"
          :disabled="collectionsBusy || isFull(collection)"
          @update:model-value="toggleCollection(collection, $event === true)"
          @select.prevent
        >
          <span class="truncate">{{ collection.title }}</span>
          <span
            v-if="isFull(collection)"
            class="ml-auto pl-2 text-xs text-muted-foreground"
            >{{ $t('addToCollection.full') }}</span
          >
        </DropdownMenuCheckboxItem>
      </template>
      <p v-if="error" role="alert" class="px-2 py-1.5 text-sm text-destructive">
        {{ error }}
      </p>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="startCreating">
        <Plus /> {{ $t('addToCollection.newCollection') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <CollectionFormDialog v-model:open="creating" @saved="onCreated" />
</template>
