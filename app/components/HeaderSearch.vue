<script setup lang="ts">
import { Search } from '@lucide/vue'

/** The search box in the header. Searching opens the home page's results. */
const term = ref('')

async function submit() {
  const q = term.value.trim()
  await navigateTo({ path: '/', query: q ? { q } : {} })
  term.value = ''
}
</script>

<template>
  <form role="search" class="relative w-full max-w-md" @submit.prevent="submit">
    <label for="header-search" class="sr-only">
      {{ $t('header.searchLabel') }}
    </label>
    <Search
      class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
    <input
      id="header-search"
      v-model="term"
      type="search"
      enterkeyhint="search"
      autocomplete="off"
      :placeholder="$t('header.searchPlaceholder')"
      class="h-9 w-full rounded-lg border border-transparent bg-muted pr-9 pl-9 text-sm outline-none placeholder:text-muted-foreground hover:border-border focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
    />
    <kbd
      class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-border bg-card px-1.5 font-mono text-[11px] leading-5 text-muted-foreground"
      aria-hidden="true"
      >/</kbd
    >
  </form>
</template>
