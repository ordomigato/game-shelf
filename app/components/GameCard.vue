<script setup lang="ts">
import type { GameSummary } from '#shared/types/game'

const props = defineProps<{ game: GameSummary }>()

const platforms = computed(() => summarizePlatforms(props.game.platforms))
</script>

<template>
  <article class="flex flex-col gap-2">
    <GameCover :name="game.name" :cover-id="game.coverId" />
    <div class="flex flex-col gap-1.5">
      <div>
        <h3 class="line-clamp-2 text-sm leading-snug font-semibold">
          {{ game.name }}
        </h3>
        <p v-if="game.year" class="text-xs text-muted-foreground">
          {{ game.year }}
        </p>
      </div>
      <ul
        v-if="platforms.shown.length"
        class="flex flex-wrap gap-1"
        aria-label="Platforms"
      >
        <li v-for="platform in platforms.shown" :key="platform">
          <Badge variant="secondary" class="text-[11px]">{{ platform }}</Badge>
        </li>
        <li v-if="platforms.hiddenCount">
          <Badge
            variant="outline"
            class="text-[11px] text-muted-foreground"
            :title="game.platforms.slice(platforms.shown.length).join(', ')"
          >
            +{{ platforms.hiddenCount }}
          </Badge>
        </li>
      </ul>
    </div>
  </article>
</template>
