<script setup lang="ts">
import { GripVertical, Heart, Pin, PinOff } from '@lucide/vue'
import type { CollectionSummary } from '#shared/types/collection'

/**
 * One collection in the sidebar. Hovering (or focusing) shows a button to
 * pin or unpin it. Pinned ones also get a grip to drag them into order, or
 * to move them with the arrow keys.
 */
const props = defineProps<{
  collection: CollectionSummary
  to: string
  current: boolean
  pinned: boolean
}>()
const emit = defineEmits<{ togglePin: []; move: [offset: -1 | 1] }>()

const titleOf = useCollectionTitle()
const title = computed(() => titleOf(props.collection))
// On pinned rows the grip takes the mark's place while hovered.
const markClass = computed(() =>
  props.pinned
    ? 'group-hover/row:opacity-0 group-has-[.sidebar-grip:focus-visible]/row:opacity-0'
    : '',
)
const dotStyle = computed(() => ({
  background: collectionColour(props.collection),
}))

function onGripKey(event: KeyboardEvent) {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    emit('move', event.key === 'ArrowUp' ? -1 : 1)
  }
}
</script>

<template>
  <li class="group/row relative">
    <NuxtLink
      :to="to"
      :aria-current="current ? 'page' : undefined"
      class="flex h-8 items-center gap-2.5 rounded-md pr-9 pl-2.5 text-sm font-medium text-muted-foreground outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground"
    >
      <Heart
        v-if="collection.kind === 'wishlist'"
        class="size-2.5 shrink-0 fill-current text-primary"
        :class="markClass"
        aria-hidden="true"
      />
      <span
        v-else
        class="size-2.5 shrink-0 rounded-sm"
        :class="markClass"
        :style="dotStyle"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 truncate">{{ title }}</span>
    </NuxtLink>

    <button
      v-if="pinned"
      type="button"
      class="sidebar-grip absolute top-1/2 left-1 grid size-6 -translate-y-1/2 cursor-grab place-items-center rounded-sm text-muted-foreground opacity-0 outline-none group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring active:cursor-grabbing"
      :aria-label="$t('sidebar.reorder', { name: title })"
      @keydown="onGripKey"
    >
      <GripVertical class="size-3.5" aria-hidden="true" />
    </button>

    <span
      class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground tabular-nums group-focus-within/row:opacity-0 group-hover/row:opacity-0"
    >
      {{ collection.itemCount }}
    </span>
    <button
      type="button"
      class="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground opacity-0 outline-none group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      :aria-label="
        pinned
          ? $t('sidebar.unpin', { name: title })
          : $t('sidebar.pin', { name: title })
      "
      @click="emit('togglePin')"
    >
      <PinOff v-if="pinned" class="size-3.5" aria-hidden="true" />
      <Pin v-else class="size-3.5" aria-hidden="true" />
    </button>
  </li>
</template>
