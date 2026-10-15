<script setup lang="ts">
/**
 * Visitors get a website: a header with search. Once signed in (with a
 * username), ThisPlayShelf becomes an app with a sidebar of their collections,
 * on every page, theirs or not.
 *
 * The page itself stays in the same place in both, so it isn't rebuilt
 * (losing what was typed) when the sign-in check finishes after loading.
 */
const { signedIn, shelfPath } = useViewer()
const app = computed(() => signedIn.value && shelfPath.value !== null)
useSearchShortcut()
</script>

<template>
  <div
    :class="{
      'md:grid md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]': app,
    }"
  >
    <AppSidebar v-if="app" :shelf-path="shelfPath!" class="hidden md:flex" />
    <div class="flex min-h-dvh min-w-0 flex-col">
      <AppTopBar v-if="app" :shelf-path="shelfPath!" />
      <SiteHeader v-else />
      <main
        class="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6"
        :class="app ? 'py-8' : 'py-10'"
      >
        <slot />
      </main>
      <SiteFooter />
    </div>
    <UnownDialog v-if="app" />
  </div>
</template>
