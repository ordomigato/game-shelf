<script setup lang="ts">
import { Check } from '@lucide/vue'
import {
  ListboxContent,
  ListboxFilter,
  ListboxItem,
  ListboxRoot,
} from 'reka-ui'

/**
 * A list to pick one of many from, with a box to narrow it by typing.
 * Arrow keys move through it and Enter picks.
 */
const props = defineProps<{
  options: { id: number; name: string }[]
  selected: number | null
  /** Placeholder and label of the search box. */
  searchLabel: string
}>()
const emit = defineEmits<{ pick: [id: number] }>()

const query = ref('')
const shown = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return props.options
  return props.options.filter((option) => {
    const name = option.name.toLowerCase()
    return words.every((word) => name.includes(word))
  })
})
</script>

<template>
  <ListboxRoot :model-value="selected ?? undefined" class="flex flex-col">
    <div class="border-b p-2">
      <ListboxFilter
        v-model="query"
        auto-focus
        :placeholder="searchLabel"
        :aria-label="searchLabel"
        class="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
    <ListboxContent class="max-h-72 overflow-y-auto p-1">
      <ListboxItem
        v-for="option in shown"
        :key="option.id"
        :value="option.id"
        class="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted"
        @select="emit('pick', option.id)"
      >
        {{ option.name }}
        <Check
          v-if="option.id === selected"
          class="ml-auto size-4"
          aria-hidden="true"
        />
      </ListboxItem>
      <p
        v-if="!shown.length"
        class="px-2 py-4 text-center text-sm text-muted-foreground"
      >
        {{ $t('search.filters.noMatches') }}
      </p>
    </ListboxContent>
  </ListboxRoot>
</template>
