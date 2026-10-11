<script setup lang="ts">
import { Compass, Heart, Library, Search } from '@lucide/vue'

/** The signed-in layout's navigation on phones, within thumb reach. */
const props = defineProps<{ shelfPath: string }>()
const route = useRoute()

const wishlistPath = computed(() => `${props.shelfPath}/wishlist`)
const tabs = computed(() => [
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
    labelKey: 'header.shelf',
    icon: Library,
    current:
      route.path.startsWith(props.shelfPath) &&
      route.path !== wishlistPath.value,
  },
  {
    to: wishlistPath.value,
    labelKey: 'shelf.wishlist',
    icon: Heart,
    current: route.path === wishlistPath.value,
  },
])
</script>

<template>
  <nav
    :aria-label="$t('sidebar.mainLabel')"
    class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card/90 px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md"
  >
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      :aria-current="tab.current ? 'page' : undefined"
      class="grid justify-items-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium text-muted-foreground aria-[current=page]:text-primary"
    >
      <component :is="tab.icon" class="size-5" aria-hidden="true" />
      {{ $t(tab.labelKey) }}
    </NuxtLink>
  </nav>
</template>
