<script setup lang="ts">
import {
  markShelves,
  markViewBox,
  markWalls,
  wordmarkBox,
  wordmarkPlay,
  wordmarkThis,
  wordmarkThisOpacity,
  wordmarkViewBox,
  wordmarkWidth,
} from '~/assets/brand/logo-paths'

/**
 * The ThisPlayShelf logo: the S-shaped glass shelf and the wordmark. The
 * shapes are the generated ones in app/assets/brand/logo-paths.ts (see
 * scripts/brand-assets.ts, the same source as public/brand). The mark takes
 * its colours from the --logo-* variables in tailwind.css and the wordmark
 * from the surrounding text colour, so both follow the theme.
 */
const props = defineProps<{
  /** Only the mark, for tight spaces. */
  compact?: boolean
  /** Only the mark on phones. */
  compactOnPhone?: boolean
  /** Smaller, for tight bars like the phone header. */
  small?: boolean
}>()

// The wordmark's box is bigger than its line of text (room for the "y" tail),
// so it is sized from the font size and the extra is taken back out in
// negative margins: the baseline, cap height and gaps stay where a plain
// line of text would put them.
const wordStyle = computed(() => {
  const k = (props.small ? 16 : 20) / 100
  const b = wordmarkBox
  return {
    height: `${b.h * k}px`,
    margin: `${b.y * k}px ${(wordmarkWidth - b.x - b.w) * k}px ${(100 - b.y - b.h) * k}px ${b.x * k}px`,
  }
})

// Each logo on the page needs its own gradient id.
const glass = `logo-glass-${useId()}`
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <svg
      :viewBox="markViewBox"
      class="w-auto shrink-0"
      :class="small ? 'h-5' : 'h-7'"
      aria-hidden="true"
    >
      <defs>
        <linearGradient :id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop
            offset="0"
            style="stop-color: var(--logo-glass-from)"
            stop-opacity=".95"
          />
          <stop
            offset=".55"
            style="stop-color: var(--logo-glass-via)"
            stop-opacity=".55"
          />
          <stop
            offset="1"
            style="stop-color: var(--logo-glass-to)"
            stop-opacity=".7"
          />
        </linearGradient>
      </defs>
      <g style="fill: var(--logo-wall); fill-opacity: var(--logo-wall-opacity)">
        <path v-for="wall in markWalls" :key="wall" :d="wall" />
      </g>
      <path
        v-for="shelf in markShelves"
        :key="shelf"
        :d="shelf"
        :fill="`url(#${glass})`"
        style="stroke: var(--logo-edge)"
        stroke-width="2.5"
        stroke-linejoin="round"
        stroke-opacity=".9"
      />
    </svg>
    <span class="sr-only">ThisPlayShelf</span>
    <svg
      :viewBox="wordmarkViewBox"
      fill="currentColor"
      class="w-auto shrink-0"
      :style="wordStyle"
      :class="{ hidden: compact, 'max-sm:hidden': compactOnPhone }"
      aria-hidden="true"
    >
      <path :d="wordmarkThis" :fill-opacity="wordmarkThisOpacity" />
      <path :d="wordmarkPlay" />
    </svg>
  </span>
</template>
