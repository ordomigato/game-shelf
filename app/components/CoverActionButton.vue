<script setup lang="ts">
import { CircleCheck, CircleMinus, CirclePlus } from '@lucide/vue'

/**
 * The round button in the corner of a game cover. `add` is a plus, `remove`
 * a minus (one click takes the game out), `have` a tick (the game is in a
 * collection, and clicking opens a menu).
 *
 * On devices that can hover it pops in when the pointer is over the
 * surrounding `.cover-actions` element, or when it has focus. Touch screens
 * have no hover, so there it's always shown. `remove` and `have` stay shown
 * everywhere, so people can see what they already have.
 */
defineProps<{
  state: 'add' | 'remove' | 'have'
  label: string
}>()
</script>

<template>
  <button
    type="button"
    class="cover-action inline-flex size-9 items-center justify-center rounded-full shadow-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    :class="
      state === 'add'
        ? 'bg-card/95 text-foreground hover:bg-card'
        : 'is-pinned bg-highlight text-highlight-foreground hover:bg-highlight/90'
    "
    :aria-label="label"
    :title="label"
  >
    <CirclePlus v-if="state === 'add'" class="size-5" aria-hidden="true" />
    <CircleMinus
      v-else-if="state === 'remove'"
      class="size-5"
      aria-hidden="true"
    />
    <CircleCheck v-else class="size-5" aria-hidden="true" />
  </button>
</template>

<style>
.cover-action {
  transition:
    opacity 0.2s,
    transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 0.15s;
}

@media (hover: hover) {
  .cover-actions .cover-action:not(.is-pinned, [data-state='open']) {
    opacity: 0;
    transform: scale(0.4) rotate(-90deg);
  }

  .cover-actions:hover .cover-action,
  .cover-actions:focus-within .cover-action {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cover-action {
    transition: none;
  }
}
</style>
