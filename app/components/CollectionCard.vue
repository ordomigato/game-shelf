<script setup lang="ts">
import { Heart, Lock } from '@lucide/vue'
import type { CollectionSummary } from '#shared/types/collection'

defineProps<{
  collection: CollectionSummary
  username: string
  /** Show owner-only details, like the Private badge. */
  showVisibility: boolean
}>()

const titleOf = useCollectionTitle()
</script>

<template>
  <NuxtLink
    :to="`/u/${username}/shelf/${collection.slug}`"
    class="group flex h-full flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm outline-none transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
  >
    <div class="flex items-start justify-between gap-2">
      <h2
        class="flex items-center gap-2 font-heading text-lg font-semibold group-hover:underline"
      >
        <Heart
          v-if="collection.kind === 'wishlist'"
          class="size-4 text-primary"
          aria-hidden="true"
        />
        {{ titleOf(collection) }}
      </h2>
      <Badge
        v-if="showVisibility && collection.visibility === 'private'"
        variant="outline"
        class="shrink-0 gap-1 text-muted-foreground"
      >
        <Lock class="size-3" aria-hidden="true" />
        {{ $t('shelf.private') }}
      </Badge>
      <Badge v-else-if="showVisibility" variant="secondary" class="shrink-0">
        {{ $t('shelf.public') }}
      </Badge>
    </div>
    <p
      v-if="collection.description"
      class="line-clamp-2 text-sm text-muted-foreground"
    >
      {{ collection.description }}
    </p>
    <p class="mt-auto pt-2 text-sm text-muted-foreground">
      {{ $t('shelf.gameCount', collection.itemCount) }}
    </p>
  </NuxtLink>
</template>
