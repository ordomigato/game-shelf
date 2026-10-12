<script setup lang="ts">
import { Menu } from '@lucide/vue'

/**
 * The signed-in layout's top bar: search and the account menu. On phones
 * it also opens the navigation drawer, which holds what the sidebar holds
 * on wider screens.
 */
const props = defineProps<{ shelfPath: string }>()
const route = useRoute()
// The home page has its own big search box.
const onHome = computed(() => route.path === '/')

const drawerOpen = ref(false)
// Following a link in the drawer closes it.
watch(
  () => route.fullPath,
  () => (drawerOpen.value = false),
)
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md"
  >
    <div class="relative flex h-14 items-center gap-2 px-4 sm:px-6">
      <Sheet v-model:open="drawerOpen">
        <SheetTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="-ml-2 md:hidden"
            :aria-label="$t('header.menu')"
          >
            <Menu class="size-5" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          class="nav-drawer w-(--sidebar-width) overflow-y-auto bg-sidebar px-2.5 py-3.5 text-sidebar-foreground"
        >
          <SheetTitle class="sr-only">{{ $t('header.menu') }}</SheetTitle>
          <SheetDescription class="sr-only">{{
            $t('sidebar.drawerDescription')
          }}</SheetDescription>
          <SidebarNav :shelf-path="props.shelfPath" />
        </SheetContent>
      </Sheet>
      <!-- Centred in the bar on phones. Wider screens show the search box
           here, and the sidebar shows the logo. -->
      <NuxtLink
        to="/"
        class="absolute left-1/2 -translate-x-1/2 rounded-md sm:hidden"
      >
        <BrandLogo small />
      </NuxtLink>
      <div class="min-w-0 flex-1">
        <HeaderSearch v-if="!onHome" class="hidden sm:block" />
      </div>
      <UserMenu />
    </div>
  </header>
</template>
