<script setup lang="ts">
/**
 * The ThisPlayShelf logo: the S-shaped glass shelf (app/assets/brand, V11)
 * and the wordmark, a small "this" before PlayShelf. Colours come from the
 * --logo-* variables in tailwind.css, so it follows the theme.
 */
defineProps<{
  /** Only the mark, for tight spaces. */
  compact?: boolean
  /** Only the mark on phones. */
  compactOnPhone?: boolean
}>()

// Each logo on the page needs its own gradient id.
const glass = `logo-glass-${useId()}`

const shelves = [
  'M70.7131 82L141.424 122.821L70.7131 163.642L0.00244141 122.821Z',
  'M70.7131 41L141.424 81.8209L70.7131 122.642L0.00244141 81.8209Z',
  'M70.7131 0L141.424 40.8209L70.7131 81.6418L0.00244141 40.8209Z',
]
</script>

<template>
  <span class="inline-flex items-center gap-2 font-heading">
    <svg viewBox="-6 -6 154 176" class="h-7 w-auto shrink-0" aria-hidden="true">
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
        <path d="M0 41.0009L70.7107 0.190869V41.0109L0 81.8209Z" />
        <path d="M70.7131 122.822L141.424 82.0118V122.832L70.7131 163.642Z" />
      </g>
      <path
        v-for="shelf in shelves"
        :key="shelf"
        :d="shelf"
        :fill="`url(#${glass})`"
        style="stroke: var(--logo-edge)"
        stroke-width="2.5"
        stroke-linejoin="round"
        stroke-opacity=".9"
      />
    </svg>
    <span
      class="text-xl leading-none whitespace-nowrap"
      :class="{ 'sr-only': compact, 'max-sm:sr-only': compactOnPhone }"
    >
      <span
        class="mr-[0.14em] align-[0.62em] text-[0.55em] font-normal tracking-wide opacity-60"
        >this</span
      ><span class="font-extrabold">PlayShelf</span>
    </span>
  </span>
</template>
