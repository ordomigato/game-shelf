<script setup lang="ts">
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import VChart from 'vue-echarts'

/**
 * Draws a bar, pie or line chart with ECharts. Only the pieces these charts
 * use are loaded, and only on pages with charts (use it as LazyChartCanvas).
 * Colours come from the theme's --chart-* colours, redone when the theme
 * changes.
 */
use([
  CanvasRenderer,
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
])

const props = defineProps<{
  kind: 'bar' | 'pie' | 'line'
  labels: string[]
  values: number[]
  /** Formats a value for tooltips and axis labels. */
  format: (value: number) => string
  /** Screen readers get this instead of the drawing. */
  summary: string
}>()

const colorMode = useColorMode()

/**
 * A CSS colour as rgba. The theme uses oklch, which ECharts can't read.
 * Keeps transparency, which the dark theme's borders use.
 */
function toRgb(cssColor: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d')
  if (!context) return cssColor
  context.fillStyle = cssColor
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a! / 255) * 100) / 100})`
}

function themeColor(name: string) {
  return toRgb(
    getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
  )
}

const palette = ref<{
  series: string[]
  text: string
  grid: string
  font: string
}>({ series: [], text: '', grid: '', font: '' })
function readPalette() {
  palette.value = {
    series: [1, 2, 3, 4, 5].map((n) => themeColor(`--chart-${n}`)),
    text: themeColor('--muted-foreground'),
    grid: themeColor('--border'),
    font: getComputedStyle(document.body).fontFamily,
  }
}
onMounted(readPalette)
// The theme class lands on <html> just after the mode changes.
watch(
  () => colorMode.value,
  () => nextTick(readPalette),
)

const option = computed<EChartsOption>(() => {
  const { series, text, grid, font } = palette.value
  const textStyle = { fontFamily: font }
  const tooltip = {
    trigger: props.kind === 'pie' ? ('item' as const) : ('axis' as const),
    valueFormatter: (value: unknown) => props.format(Number(value)),
  }
  if (props.kind === 'pie') {
    return {
      color: series,
      textStyle,
      tooltip,
      legend: { bottom: 0, textStyle: { color: text }, type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '68%'],
          center: ['50%', '45%'],
          label: { show: false },
          data: props.labels.map((name, index) => ({
            name,
            value: props.values[index],
          })),
        },
      ],
    }
  }
  return {
    color: series,
    textStyle,
    tooltip,
    grid: { left: 8, right: 12, top: 12, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: props.labels,
      axisLabel: {
        color: text,
        hideOverlap: true,
        rotate: props.kind === 'bar' && props.labels.length > 6 ? 30 : 0,
      },
      axisLine: { lineStyle: { color: grid } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: text,
        formatter: (value: number) => props.format(value),
      },
      splitLine: { lineStyle: { color: grid } },
    },
    series: [
      props.kind === 'bar'
        ? {
            type: 'bar',
            data: props.values,
            itemStyle: { borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 48,
          }
        : {
            type: 'line',
            data: props.values,
            smooth: true,
            showSymbol: props.values.length <= 24,
            areaStyle: { opacity: 0.15 },
          },
    ],
  }
})
</script>

<template>
  <figure class="size-full">
    <VChart
      v-if="palette.series.length"
      :option="option"
      autoresize
      class="size-full"
      aria-hidden="true"
    />
    <figcaption class="sr-only">{{ summary }}</figcaption>
  </figure>
</template>
