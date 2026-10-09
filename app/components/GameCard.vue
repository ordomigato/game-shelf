<script setup lang="ts">
import type { GameSummary } from '#shared/types/game'

const props = defineProps<{ game: GameSummary }>()

const details = computed(() =>
  [props.game.year, formatPlatforms(props.game.platforms)]
    .filter(Boolean)
    .join(' · '),
)
</script>

<template>
  <article class="flex flex-col gap-2">
    <GameCover :name="game.name" :cover-id="game.coverId" />
    <div>
      <h3 class="line-clamp-2 text-sm leading-snug font-semibold">
        {{ game.name }}
      </h3>
      <p
        v-if="details"
        class="mt-0.5 line-clamp-1 text-xs text-muted-foreground"
      >
        {{ details }}
      </p>
    </div>
  </article>
</template>
