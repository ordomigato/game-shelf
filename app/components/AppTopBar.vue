<script setup lang="ts">
import { Search } from '@lucide/vue'

/** The signed-in layout's top bar: search and the account menu. */
const route = useRoute()
// The home page has its own big search box.
const onHome = computed(() => route.path === '/')
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md"
  >
    <div class="flex h-14 items-center gap-3 px-4 sm:px-6">
      <!-- The sidebar shows the logo on wider screens. -->
      <NuxtLink to="/" class="rounded-md md:hidden">
        <BrandLogo compact-on-phone />
      </NuxtLink>
      <div class="min-w-0 flex-1">
        <HeaderSearch v-if="!onHome" class="hidden sm:block" />
      </div>
      <Button
        v-if="!onHome"
        as-child
        variant="ghost"
        size="icon"
        class="sm:hidden"
      >
        <NuxtLink to="/" :aria-label="$t('header.searchLabel')">
          <Search class="size-5" aria-hidden="true" />
        </NuxtLink>
      </Button>
      <UserMenu />
    </div>
  </header>
</template>
