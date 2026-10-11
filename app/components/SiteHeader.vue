<script setup lang="ts">
import { Compass, Search } from '@lucide/vue'

/**
 * The header for visitors: search first, Explore, and a way to join.
 * Signed-in users get the sidebar layout instead (AppSidebar).
 */
const route = useRoute()
const { signedIn } = useViewer()
// The home page has its own big search box.
const onHome = computed(() => route.path === '/')
const loginTo = computed(() => ({
  path: '/login',
  query: onHome.value ? {} : { redirect: route.fullPath },
}))
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md"
  >
    <div
      class="mx-auto grid h-14 w-full max-w-6xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 sm:px-6"
    >
      <NuxtLink to="/" class="rounded-md">
        <BrandLogo compact-on-phone />
      </NuxtLink>
      <div class="flex justify-center">
        <HeaderSearch v-if="!onHome" class="hidden sm:block" />
      </div>
      <div class="flex items-center gap-1.5">
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
        <Button as-child variant="ghost">
          <NuxtLink to="/explore">
            <Compass class="size-5" aria-hidden="true" />
            <span class="hidden sm:inline">{{ $t('header.explore') }}</span>
            <span class="sr-only sm:hidden">{{ $t('header.explore') }}</span>
          </NuxtLink>
        </Button>
        <!-- Signed in but no username yet (the welcome screen). -->
        <UserMenu v-if="signedIn" />
        <template v-else>
          <Button as-child variant="ghost">
            <NuxtLink :to="loginTo">{{ $t('header.signIn') }}</NuxtLink>
          </Button>
          <Button as-child class="hidden sm:inline-flex">
            <NuxtLink to="/signup">{{ $t('header.createAccount') }}</NuxtLink>
          </Button>
        </template>
      </div>
    </div>
  </header>
</template>
