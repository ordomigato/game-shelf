<script setup lang="ts">
import { Ellipsis, GripVertical, Pencil, Trash2 } from '@lucide/vue'
import type { ChartSize, ChartWidget } from '#shared/types/charts'
import type { FieldDefinition } from '#shared/types/collection'
import {
  chartProblem,
  defaultTitle,
  groupValues,
  measureValue,
  timeSeries,
  type ChartItem,
  type GroupLabel,
} from '#shared/utils/charts'

/**
 * One chart on a collection's dashboard, worked out from the collection's
 * games right here in the browser. Owners get a handle to drag it and a
 * menu to edit, resize or remove it.
 */
const props = defineProps<{
  widget: ChartWidget
  fields: FieldDefinition[]
  items: ChartItem[]
  editable?: boolean
}>()
const emit = defineEmits<{
  edit: []
  resize: [size: ChartSize]
  remove: []
}>()

const { t, locale } = useI18n()

const problem = computed(() => chartProblem(props.widget, props.fields))
const title = computed(() => {
  if (props.widget.title) return props.widget.title
  const message = defaultTitle(props.widget, props.fields)
  return t(message.key, message.params ?? {})
})

const format = (value: number) =>
  formatMeasure(value, props.widget.measure, props.fields, locale.value)

const groupField = computed(() =>
  props.fields.find((field) => field.id === props.widget.groupBy),
)
function groupLabel(label: GroupLabel): string {
  switch (label.kind) {
    case 'none':
      return t('charts.notSet')
    case 'other':
      return t('charts.other')
    case 'yes':
      return t('table.ticked')
    case 'no':
      return t('table.notTicked')
    default:
      return groupField.value?.type === 'rating'
        ? formatFieldValue(groupField.value, Number(label.text), locale.value)
        : label.text
  }
}

type Result =
  | { type: 'number'; value: number | null }
  | { type: 'chart'; labels: string[]; values: number[] }

/** The number, or the labels and values to draw. */
const result = computed<Result | null>(() => {
  if (problem.value) return null
  const { widget, items, fields } = props
  if (widget.kind === 'number') {
    return { type: 'number', value: measureValue(items, widget.measure) }
  }
  if (widget.kind === 'line') {
    const points = timeSeries(items, widget)
    return {
      type: 'chart',
      labels: points.map((point) => formatBucket(point.bucket, locale.value)),
      values: points.map((point) => point.value),
    }
  }
  const groups = groupValues(items, fields, widget)
  return {
    type: 'chart',
    labels: groups.map((group) => groupLabel(group.label)),
    values: groups.map((group) => group.value),
  }
})

const chartKind = computed(() =>
  props.widget.kind === 'number' ? 'bar' : props.widget.kind,
)

const summary = computed(() => {
  const data = result.value
  if (data?.type !== 'chart') return ''
  return data.labels
    .map((label, index) => `${label}: ${format(data.values[index]!)}`)
    .join(', ')
})

const sizes: { size: ChartSize; labelKey: string }[] = [
  { size: 'small', labelKey: 'charts.sizes.small' },
  { size: 'medium', labelKey: 'charts.sizes.medium' },
  { size: 'large', labelKey: 'charts.sizes.large' },
]
</script>

<template>
  <section
    class="flex h-full flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm"
    :aria-label="title"
  >
    <header class="flex items-start gap-2">
      <span
        v-if="editable"
        class="chart-handle -ml-1 flex cursor-grab touch-none items-center rounded-sm py-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        :title="$t('charts.drag')"
        aria-hidden="true"
      >
        <GripVertical class="size-4" />
      </span>
      <h3 class="min-w-0 flex-1 font-heading font-semibold">{{ title }}</h3>
      <DropdownMenu v-if="editable">
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            class="-mt-1 -mr-2"
            :aria-label="$t('charts.actions', { title })"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-max">
          <DropdownMenuItem @select="emit('edit')">
            <Pencil /> {{ $t('charts.edit') }}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{{
              $t('charts.size')
            }}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                :model-value="widget.size"
                @update:model-value="emit('resize', $event as ChartSize)"
              >
                <DropdownMenuRadioItem
                  v-for="option in sizes"
                  :key="option.size"
                  :value="option.size"
                >
                  {{ $t(option.labelKey) }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            class="text-destructive focus:text-destructive"
            @select="emit('remove')"
          >
            <Trash2 /> {{ $t('charts.remove') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>

    <p v-if="problem" class="text-sm text-muted-foreground">
      {{ $t(problem.key, problem.params ?? {}) }}
    </p>
    <p
      v-else-if="result?.type === 'number'"
      class="font-heading text-4xl font-bold tabular-nums"
    >
      {{ formatMeasure(result.value, widget.measure, fields, locale) }}
    </p>
    <p
      v-else-if="result && !result.values.length"
      class="text-sm text-muted-foreground"
    >
      {{ $t('charts.noData') }}
    </p>
    <div v-else-if="result" class="h-64">
      <ClientOnly>
        <LazyChartCanvas
          :kind="chartKind"
          :labels="result.labels"
          :values="result.values"
          :format="format"
          :summary="summary"
        />
      </ClientOnly>
    </div>
  </section>
</template>
