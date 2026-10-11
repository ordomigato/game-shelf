<script setup lang="ts">
import {
  ChevronDown,
  Compass,
  Heart,
  LayoutTemplate,
  Library,
  Plus,
  Search,
  Settings,
} from '@lucide/vue'
import type { CollectionSummary } from '#shared/types/collection'

/** How many collections the sidebar lists before "View all". */
const SHOWN_COLLECTIONS = 8

/**
 * The signed-in layout's sidebar: the main sections, then the user's
 * collections (Wishlist first, then the most recently changed).
 */
const props = defineProps<{ shelfPath: string }>()

const route = useRoute()
const titleOf = useCollectionTitle()
const { list, refresh } = useMyCollections()

onMounted(() => {
  if (list.value === null) onNuxtReady(() => void refresh())
})

// Folding the list is remembered in a cookie, so the server draws it the
// same way.
const open = useCookie<boolean>('gs_sidebar_collections', {
  default: () => true,
  path: '/',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365,
})

const sorted = computed(() =>
  [...(list.value ?? [])].sort(
    (a, b) =>
      Number(b.kind === 'wishlist') - Number(a.kind === 'wishlist') ||
      b.updatedAt.localeCompare(a.updatedAt),
  ),
)
const shown = computed(() => sorted.value.slice(0, SHOWN_COLLECTIONS))
const hiddenCount = computed(() => sorted.value.length - shown.value.length)

const collectionPath = (collection: CollectionSummary) =>
  `${props.shelfPath}/${collection.slug}`
const dotStyle = (collection: CollectionSummary) => ({
  background: generatedCoverColors(collection.title).from,
})

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
])
const footer = computed(() => [
  {
    to: '/blueprints',
    labelKey: 'header.blueprints',
    icon: LayoutTemplate,
    current: route.path.startsWith('/blueprints'),
  },
  {
    to: '/account/settings',
    labelKey: 'header.settings',
    icon: Settings,
    current: route.path.startsWith('/account'),
  },
])

const itemClass =
  'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground'
</script>

<template>
  <aside
    class="sticky top-0 h-dvh w-(--sidebar-width) flex-col gap-0.5 overflow-y-auto border-r border-sidebar-border bg-sidebar px-2.5 py-3.5 text-sidebar-foreground"
  >
    <NuxtLink to="/" class="mb-3 self-start rounded-md px-2 py-1">
      <BrandLogo />
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

    <div class="mt-4 flex items-center gap-0.5 pr-1 pl-2.5">
      <h2
        id="sidebar-collections"
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
        aria-controls="sidebar-collection-list"
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
      id="sidebar-collection-list"
      aria-labelledby="sidebar-collections"
      class="flex flex-col gap-0.5"
    >
      <template v-if="list === null">
        <li
          v-for="n in 4"
          :key="n"
          class="flex h-8 items-center gap-2.5 px-2.5"
        >
          <Skeleton class="size-2.5 rounded-sm" />
          <Skeleton class="h-3 flex-1" />
        </li>
      </template>
      <li v-for="collection in shown" :key="collection.id">
        <NuxtLink
          :to="collectionPath(collection)"
          :class="itemClass"
          :aria-current="
            route.path === collectionPath(collection) ? 'page' : undefined
          "
        >
          <Heart
            v-if="collection.kind === 'wishlist'"
            class="size-3.5 shrink-0 fill-current text-primary"
            aria-hidden="true"
          />
          <span
            v-else
            class="size-2.5 shrink-0 rounded-sm"
            :style="dotStyle(collection)"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate">{{ titleOf(collection) }}</span>
          <span class="text-xs text-muted-foreground tabular-nums">
            {{ collection.itemCount }}
          </span>
        </NuxtLink>
      </li>
      <li v-if="hiddenCount > 0">
        <NuxtLink
          :to="shelfPath"
          class="block rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-sidebar-foreground"
        >
          {{ $t('sidebar.viewAll', { count: sorted.length }) }}
        </NuxtLink>
      </li>
    </ul>

    <nav
      :aria-label="$t('sidebar.moreLabel')"
      class="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border pt-2.5"
    >
      <NuxtLink
        v-for="item in footer"
        :key="item.to"
        :to="item.to"
        :class="itemClass"
        :aria-current="item.current ? 'page' : undefined"
      >
        <component :is="item.icon" class="size-4" aria-hidden="true" />
        {{ $t(item.labelKey) }}
      </NuxtLink>
    </nav>
  </aside>
</template>
