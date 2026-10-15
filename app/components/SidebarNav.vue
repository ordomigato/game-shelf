<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import {
  ChevronDown,
  Compass,
  Gamepad2,
  Library,
  Plus,
  Search,
} from '@lucide/vue'
import type { CollectionSummary } from '#shared/types/collection'

/** How many unpinned collections the sidebar lists before "View all". */
const SHOWN_COLLECTIONS = 8

/**
 * The signed-in navigation: the main sections, the collections the user
 * pinned (in their order), then the rest, most recently changed first.
 * Shown in the sidebar on wide screens and in the drawer on phones.
 */
const props = defineProps<{
  shelfPath: string
  /** The smaller logo, matching the phone top bar (in the drawer). */
  smallLogo?: boolean
}>()

const route = useRoute()
// Ids stay unique when the sidebar and the drawer are both on the page.
const ids = {
  pinned: useId(),
  collections: useId(),
  list: useId(),
}
const root = useTemplateRef<HTMLElement>('root')
const { list, load, pinned, unpinned, pin, unpin } = useMyCollections()

onMounted(() => {
  // The page or the other copy of this list may be loading it already.
  if (list.value === null) onNuxtReady(() => void load().catch(() => {}))
})

// Folding the list is remembered in a cookie, so the server draws it the
// same way.
const open = useCookie<boolean>('gs_sidebar_collections', {
  default: () => true,
  path: '/',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365,
})

const shown = computed(() => unpinned.value.slice(0, SHOWN_COLLECTIONS))
const hiddenCount = computed(() => unpinned.value.length - shown.value.length)

const collectionPath = (collection: CollectionSummary) =>
  `${props.shelfPath}/${collection.slug}`
const isCurrent = (collection: CollectionSummary) =>
  route.path === collectionPath(collection)

function togglePin(collection: CollectionSummary) {
  if (collection.pinnedPosition == null) void pin(collection)
  else void unpin(collection)
}

// The drag list works on its own copy, kept in step with the pins.
const pinnedOrder = ref<CollectionSummary[]>([])
watch(pinned, (value) => (pinnedOrder.value = [...value]), { immediate: true })

/** Saves a pin's new place: after the one above it, or first. */
function placeAt(collection: CollectionSummary, index: number) {
  const others = pinned.value.filter((other) => other.id !== collection.id)
  void pin(collection, index === 0 ? null : others[index - 1]!.id)
}

function onDragged(event: { oldIndex?: number; newIndex?: number }) {
  const { oldIndex, newIndex } = event
  if (oldIndex === undefined || newIndex === undefined) return
  const moved = pinned.value[oldIndex]
  if (moved && oldIndex !== newIndex) placeAt(moved, newIndex)
}

/** Arrow keys on a pin's grip move it up or down one place. */
async function moveBy(collection: CollectionSummary, offset: -1 | 1) {
  const index = pinned.value.findIndex((other) => other.id === collection.id)
  const target = index + offset
  if (index === -1 || target < 0 || target >= pinned.value.length) return
  placeAt(collection, target)
  // Keep focus on the grip, which moved with its row.
  await nextTick()
  root.value
    ?.querySelector<HTMLElement>(
      `[data-pin-id="${collection.id}"] .sidebar-grip`,
    )
    ?.focus()
}

const sections = computed(() => [
  {
    to: '/',
    labelKey: 'header.search',
    icon: Search,
    current: route.path === '/',
  },
  {
    to: '/explore',
    labelKey: 'header.explore',
    icon: Compass,
    current: route.path === '/explore',
  },
  {
    to: props.shelfPath,
    labelKey: 'header.myShelf',
    icon: Library,
    current: route.path === props.shelfPath,
  },
  {
    to: '/owned',
    labelKey: 'header.owned',
    icon: Gamepad2,
    current: route.path === '/owned',
  },
])

const itemClass =
  'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground'
</script>

<template>
  <div ref="root" class="flex flex-col gap-0.5">
    <NuxtLink to="/" class="mb-3 self-start rounded-md px-2 py-1">
      <BrandLogo :small="smallLogo" />
    </NuxtLink>

    <nav :aria-label="$t('sidebar.mainLabel')" class="flex flex-col gap-0.5">
      <NuxtLink
        v-for="item in sections"
        :key="item.to"
        :to="item.to"
        :class="itemClass"
        :aria-current="item.current ? 'page' : undefined"
      >
        <component :is="item.icon" class="size-4" aria-hidden="true" />
        {{ $t(item.labelKey) }}
      </NuxtLink>
    </nav>

    <h2
      :id="ids.pinned"
      class="mt-4 px-2.5 py-1 font-sans text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
    >
      {{ $t('sidebar.pinned') }}
    </h2>
    <ul
      v-if="list === null"
      :aria-labelledby="ids.pinned"
      class="flex flex-col gap-0.5"
    >
      <li v-for="n in 3" :key="n" class="flex h-8 items-center gap-2.5 px-2.5">
        <Skeleton class="size-2.5 rounded-sm" />
        <Skeleton class="h-3 flex-1" />
      </li>
    </ul>
    <p
      v-else-if="!pinned.length"
      class="mx-1 rounded-md border border-dashed border-sidebar-border px-2.5 py-2 text-xs text-muted-foreground"
    >
      {{ $t('sidebar.pinHint') }}
    </p>
    <VueDraggable
      v-else
      v-model="pinnedOrder"
      tag="ul"
      :aria-labelledby="ids.pinned"
      class="flex flex-col gap-0.5"
      handle=".sidebar-grip"
      ghost-class="drag-gap"
      :animation="150"
      @update="onDragged"
    >
      <SidebarCollection
        v-for="collection in pinnedOrder"
        :key="collection.id"
        :data-pin-id="collection.id"
        :collection="collection"
        :to="collectionPath(collection)"
        :current="isCurrent(collection)"
        pinned
        @toggle-pin="togglePin(collection)"
        @move="moveBy(collection, $event)"
      />
    </VueDraggable>

    <div class="mt-4 flex items-center gap-0.5 pr-1 pl-2.5">
      <h2
        :id="ids.collections"
        class="flex-1 font-sans text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
      >
        {{ $t('sidebar.collections') }}
      </h2>
      <Button
        as-child
        variant="ghost"
        size="icon-xs"
        class="text-muted-foreground"
      >
        <NuxtLink
          :to="{ path: shelfPath, query: { new: '1' } }"
          :aria-label="$t('sidebar.newCollection')"
        >
          <Plus aria-hidden="true" />
        </NuxtLink>
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        class="text-muted-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground hover:aria-expanded:bg-muted"
        :aria-expanded="open"
        :aria-controls="ids.list"
        :aria-label="$t('sidebar.toggleCollections')"
        @click="open = !open"
      >
        <ChevronDown
          class="transition-transform"
          :class="{ '-rotate-90': !open }"
          aria-hidden="true"
        />
      </Button>
    </div>

    <ul
      v-show="open"
      :id="ids.list"
      :aria-labelledby="ids.collections"
      class="flex flex-col gap-0.5"
    >
      <SidebarCollection
        v-for="collection in shown"
        :key="collection.id"
        :collection="collection"
        :to="collectionPath(collection)"
        :current="isCurrent(collection)"
        :pinned="false"
        @toggle-pin="togglePin(collection)"
      />
      <li v-if="hiddenCount > 0">
        <NuxtLink
          :to="shelfPath"
          class="block rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-sidebar-foreground"
        >
          {{ $t('sidebar.viewAll', { count: list?.length ?? 0 }) }}
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
