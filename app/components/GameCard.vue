<script setup lang="ts">
import type { GameSummary } from '#shared/types/game'

const props = defineProps<{ game: GameSummary }>()

const expanded = ref(false)

const platforms = computed(() => summarizePlatforms(props.game.platforms))
const visiblePlatforms = computed(() =>
  expanded.value ? props.game.platforms : platforms.value.shown,
)
const hiddenPlatforms = computed(() =>
  props.game.platforms.slice(platforms.value.shown.length),
)
</script>

<template>
  <article class="flex flex-col gap-2">
    <NuxtLink
      :to="`/games/${game.id}`"
      class="group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <GameCover
        :name="game.name"
        :cover-id="game.coverId"
        class="transition group-hover:ring-2 group-hover:ring-primary"
      />
      <div>
        <h3
          class="line-clamp-2 text-sm leading-snug font-semibold group-hover:underline"
        >
          {{ game.name }}
        </h3>
        <p v-if="game.year" class="text-xs text-muted-foreground">
          {{ game.year }}
        </p>
      </div>
    </NuxtLink>
    <div class="flex flex-col gap-1.5">
      <ul
        v-if="game.platforms.length"
        class="flex flex-wrap gap-1"
        :aria-label="$t('game.platforms')"
      >
        <li
          v-for="platform in visiblePlatforms"
          :key="platform"
          class="max-w-full min-w-0"
        >
          <PlatformPill :name="platform" />
        </li>
        <li v-if="platforms.hiddenCount && !expanded">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="rounded-4xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :aria-label="
                  $t('game.showMorePlatforms', platforms.hiddenCount)
                "
                @click="expanded = true"
              >
                <Badge
                  variant="outline"
                  class="cursor-pointer text-[11px] text-muted-foreground hover:bg-muted"
                >
                  +{{ platforms.hiddenCount }}
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent>{{ hiddenPlatforms.join(', ') }}</TooltipContent>
          </Tooltip>
        </li>
      </ul>
    </div>
  </article>
</template>
