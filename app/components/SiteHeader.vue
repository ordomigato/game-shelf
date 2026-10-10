<script setup lang="ts">
import { Compass } from '@lucide/vue'
</script>

<template>
  <header
    class="border-b-4 border-shelf bg-masthead text-masthead-foreground shadow-[0_2px_0_var(--shelf-edge)]"
  >
    <div
      class="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6"
    >
      <NuxtLink to="/" class="font-heading text-2xl font-bold tracking-tight">
        GameShelf
      </NuxtLink>
      <div class="flex items-center gap-1">
        <Button
          as-child
          variant="ghost"
          class="text-masthead-foreground hover:bg-masthead-foreground/15 hover:text-masthead-foreground"
        >
          <NuxtLink to="/explore">
            <Compass class="size-5" aria-hidden="true" />
            <span class="hidden sm:inline">{{ $t('header.explore') }}</span>
            <span class="sr-only sm:hidden">{{ $t('header.explore') }}</span>
          </NuxtLink>
        </Button>
        <UserMenu />
      </div>
    </div>
  </header>
</template>
