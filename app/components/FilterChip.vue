<script setup lang="ts">
import { ChevronDown, X } from '@lucide/vue'

/**
 * One search filter as a pill. Empty, it shows its name and opens its
 * choices in a popover. Set, it shows the choice, filled in, with an ×
 * to remove it.
 */
defineProps<{
  /** The filter's name, like "Platform". */
  label: string
  /** What it's set to, or null when it isn't. */
  value: string | null
}>()
const emit = defineEmits<{ clear: [] }>()
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <Popover v-model:open="open">
    <div
      class="inline-flex h-9 items-center rounded-full border text-sm font-medium"
      :class="
        value
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-dashed border-border bg-card'
      "
    >
      <PopoverTrigger as-child>
        <button
          type="button"
          class="inline-flex h-full max-w-56 items-center gap-1.5 rounded-full pl-3.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          :class="value ? 'pr-1' : 'pr-3'"
          :aria-label="value ? `${label}: ${value}` : undefined"
        >
          <span class="truncate">{{ value ?? label }}</span>
          <ChevronDown v-if="!value" class="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <button
        v-if="value"
        type="button"
        class="mr-1 grid size-7 place-items-center rounded-full outline-none hover:bg-primary-foreground/15 focus-visible:ring-3 focus-visible:ring-ring/50"
        :aria-label="$t('search.filters.remove', { name: label })"
        @click="emit('clear')"
      >
        <X class="size-3.5" aria-hidden="true" />
      </button>
    </div>
    <PopoverContent align="start" class="w-72 p-0">
      <slot />
    </PopoverContent>
  </Popover>
</template>
