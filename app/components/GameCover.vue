<script setup lang="ts">
const props = defineProps<{
  name: string
  coverId: string | null
}>()

const src = computed(() =>
  props.coverId ? igdbImageUrl(props.coverId, 'cover_big') : null,
)
const srcset = computed(() =>
  props.coverId
    ? `${igdbImageUrl(props.coverId, 'cover_big')} 1x, ${igdbImageUrl(props.coverId, 'cover_big_2x')} 2x`
    : undefined,
)
</script>

<template>
  <div
    class="relative aspect-[3/4] overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-border"
  >
    <img
      v-if="src"
      :src="src"
      :srcset="srcset"
      :alt="$t('game.coverAlt', { name })"
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
    />
    <div
      v-else
      class="flex size-full items-end bg-gradient-to-br from-shelf to-masthead p-3"
    >
      <span
        class="line-clamp-4 font-heading text-lg leading-tight font-bold text-white"
      >
        {{ name }}
      </span>
    </div>
  </div>
</template>
