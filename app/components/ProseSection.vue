<script setup lang="ts">
/** A titled block of reading text on the About and Privacy pages. */
defineProps<{ title: string }>()
</script>

<template>
  <section class="flex flex-col gap-2">
    <h2 class="text-xl font-semibold">{{ title }}</h2>
    <div class="flex flex-col gap-3 leading-relaxed text-muted-foreground">
      <slot />
    </div>
  </section>
</template>
