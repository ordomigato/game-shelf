<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name: string
    coverId: string | null
    /** `thumb` is a small cover next to a name, as in the table. */
    size?: 'full' | 'thumb'
  }>(),
  { size: 'full' },
)

const src = computed(() => {
  if (!props.coverId) return null
  return igdbImageUrl(
    props.coverId,
    props.size === 'thumb' ? 'cover_small' : 'cover_big',
  )
})
const srcset = computed(() =>
  props.coverId && props.size === 'full'
    ? `${igdbImageUrl(props.coverId, 'cover_big')} 1x, ${igdbImageUrl(props.coverId, 'cover_big_2x')} 2x`
    : undefined,
)
const generated = computed(() => {
  const { from, to } = generatedCoverColors(props.name)
  return { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }
})
</script>

<template>
  <div
    class="relative aspect-[3/4] overflow-hidden bg-muted ring-1 ring-border"
    :class="size === 'thumb' ? 'rounded-sm' : 'rounded-md shadow-sm'"
  >
    <img
      v-if="src"
      :src="src"
      :srcset="srcset"
      :alt="size === 'thumb' ? '' : $t('game.coverAlt', { name })"
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
    />
    <!-- A thumbnail sits next to the name, so it skips the title. -->
    <div
      v-else
      class="flex size-full items-end p-3"
      :style="generated"
      aria-hidden="true"
    >
      <span
        v-if="size === 'full'"
        class="line-clamp-4 font-heading text-lg leading-tight font-bold text-white"
      >
        {{ name }}
      </span>
    </div>
  </div>
</template>
