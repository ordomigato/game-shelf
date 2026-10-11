<script setup lang="ts">
/** The GameShelf mark (three game boxes) and wordmark. */
defineProps<{
  /** Only the mark, for tight spaces. */
  compact?: boolean
  /** Only the mark on phones. */
  compactOnPhone?: boolean
}>()
</script>

<template>
  <span class="inline-flex items-center gap-2 font-heading text-xl font-bold">
    <svg viewBox="0 0 22 22" class="size-6 shrink-0" aria-hidden="true">
      <rect x="2" y="4" width="5" height="16" rx="1.5" class="fill-primary" />
      <rect x="8.5" y="2" width="5" height="18" rx="1.5" class="fill-ring" />
      <rect
        x="15"
        y="7"
        width="5"
        height="13"
        rx="1.5"
        transform="rotate(-8 17.5 13.5)"
        class="fill-highlight"
      />
    </svg>
    <span :class="{ 'sr-only': compact, 'max-sm:sr-only': compactOnPhone }"
      >GameShelf</span
    >
  </span>
</template>
