<script setup lang="ts">
import type { ExploreCollection } from '#shared/types/collection'

/** A public collection on Explore: a strip of its first covers, its name and owner. */
const props = defineProps<{ collection: ExploreCollection }>()

const titleOf = useCollectionTitle()
const owner = computed(
  () => props.collection.owner.displayName || props.collection.owner.username,
)
// Always four slots, so cards line up however many games they have.
const slots = computed(() =>
  Array.from({ length: 4 }, (_, i) => props.collection.preview[i] ?? null),
)
</script>

<template>
  <NuxtLink
    :to="`/u/${collection.owner.username}/shelf/${collection.slug}`"
    class="group flex h-full flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm outline-none transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
  >
    <div class="grid grid-cols-4 gap-1.5" aria-hidden="true">
      <template v-for="(game, index) in slots" :key="index">
        <GameCover
          v-if="game"
          :name="game.name"
          :cover-id="game.coverId"
          size="thumb"
        />
        <div v-else class="aspect-[3/4] rounded-sm bg-muted" />
      </template>
    </div>
    <div class="flex flex-col gap-0.5 px-1">
      <h2 class="font-heading text-lg font-semibold group-hover:underline">
        {{ titleOf(collection) }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ $t('explore.by', { owner }) }} ·
        {{ $t('shelf.gameCount', collection.itemCount) }}
      </p>
      <p
        v-if="collection.description"
        class="mt-1 line-clamp-2 text-sm text-muted-foreground"
      >
        {{ collection.description }}
      </p>
    </div>
  </NuxtLink>
</template>
