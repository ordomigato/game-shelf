<script setup lang="ts">
import { ChartColumn, ChartLine, ChartPie, Hash } from '@lucide/vue'
import type {
  ChartKind,
  ChartMeasure,
  ChartSize,
  ChartWidget,
} from '#shared/types/charts'
import type { Component } from 'vue'
import type { FieldDefinition } from '#shared/types/collection'
import type { Message } from '#shared/types/message'
import {
  checkboxFields,
  dateFields,
  groupableFields,
  numericFields,
  type ChartItem,
} from '#shared/utils/charts'

/**
 * Adds or edits a chart: what kind, what it measures, how it splits the
 * games or spreads them over time, and how wide it is. A preview shows
 * the chart with the collection's real games as the settings change.
 */
const props = defineProps<{
  /** Set to edit this chart. Leave out to add a new one. */
  widget?: ChartWidget
  fields: FieldDefinition[]
  items: ChartItem[]
}>()
const emit = defineEmits<{ save: [widget: ChartWidget] }>()
const open = defineModel<boolean>('open', { default: false })

type MeasureOp = ChartMeasure['op']

const kind = ref<ChartKind>('number')
const title = ref('')
const size = ref<ChartSize>('small')
const op = ref<MeasureOp>('count')
const measureField = ref('')
const groupBy = ref('')
const source = ref('addedAt')
const bucket = ref<'month' | 'year'>('month')
const cumulative = ref(false)

const numeric = computed(() => numericFields(props.fields))
const checkboxes = computed(() => checkboxFields(props.fields))
const groupable = computed(() => groupableFields(props.fields))
const dates = computed(() => dateFields(props.fields))

watch(open, (isOpen) => {
  if (!isOpen) return
  const widget = props.widget
  kind.value = widget?.kind ?? 'number'
  title.value = widget?.title ?? ''
  size.value = widget?.size ?? 'small'
  op.value = widget?.measure.op ?? 'count'
  measureField.value =
    widget && widget.measure.op !== 'count' ? widget.measure.fieldId : ''
  groupBy.value = widget?.groupBy ?? groupable.value[0]?.id ?? ''
  source.value = widget?.timeline?.source ?? 'addedAt'
  bucket.value = widget?.timeline?.bucket ?? 'month'
  cumulative.value = widget?.timeline?.cumulative ?? false
})

// A field to measure that fits the chosen measure.
const measureOptions = computed(() =>
  op.value === 'percent' ? checkboxes.value : numeric.value,
)
watch([op, measureOptions], () => {
  if (op.value === 'count') return
  if (!measureOptions.value.some((field) => field.id === measureField.value)) {
    measureField.value = measureOptions.value[0]?.id ?? ''
  }
})

function setKind(next: ChartKind) {
  kind.value = next
  // Charts with axes or slices read better with room.
  if (next !== 'number' && size.value === 'small' && !props.widget) {
    size.value = 'medium'
  }
}

const kinds: { kind: ChartKind; icon: Component; labelKey: string }[] = [
  { kind: 'number', icon: Hash, labelKey: 'charts.kinds.number' },
  { kind: 'bar', icon: ChartColumn, labelKey: 'charts.kinds.bar' },
  { kind: 'pie', icon: ChartPie, labelKey: 'charts.kinds.pie' },
  { kind: 'line', icon: ChartLine, labelKey: 'charts.kinds.line' },
]

const ops = computed(() =>
  [
    { op: 'count' as const, labelKey: 'charts.ops.count', available: true },
    {
      op: 'sum' as const,
      labelKey: 'charts.ops.sum',
      available: numeric.value.length > 0,
    },
    {
      op: 'average' as const,
      labelKey: 'charts.ops.average',
      available: numeric.value.length > 0,
    },
    {
      op: 'min' as const,
      labelKey: 'charts.ops.min',
      available: numeric.value.length > 0,
    },
    {
      op: 'max' as const,
      labelKey: 'charts.ops.max',
      available: numeric.value.length > 0,
    },
    {
      op: 'percent' as const,
      labelKey: 'charts.ops.percent',
      available: checkboxes.value.length > 0,
    },
  ].filter((option) => option.available),
)

const draft = computed<ChartWidget>(() => ({
  id: props.widget?.id ?? 'preview',
  kind: kind.value,
  title: title.value.trim(),
  size: size.value,
  measure:
    op.value === 'count'
      ? { op: 'count' }
      : op.value === 'percent'
        ? { op: 'percent', fieldId: measureField.value }
        : { op: op.value, fieldId: measureField.value },
  ...((kind.value === 'bar' || kind.value === 'pie') && {
    groupBy: groupBy.value,
  }),
  ...(kind.value === 'line' && {
    timeline: {
      source: source.value,
      bucket: bucket.value,
      cumulative: cumulative.value,
    },
  }),
}))

/** Why the chart can't be saved yet. */
const missing = computed<Message | null>(() => {
  if (op.value !== 'count' && !measureField.value) {
    return { key: 'charts.editor.needsField' }
  }
  if ((kind.value === 'bar' || kind.value === 'pie') && !groupBy.value) {
    return { key: 'charts.editor.needsGroup' }
  }
  return null
})

function save() {
  if (missing.value) return
  emit('save', {
    ...draft.value,
    id: props.widget?.id ?? crypto.randomUUID(),
  })
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{
          widget ? $t('charts.editor.editTitle') : $t('charts.editor.addTitle')
        }}</DialogTitle>
        <DialogDescription>{{
          $t('charts.editor.description')
        }}</DialogDescription>
      </DialogHeader>

      <form
        id="chart-form"
        class="grid gap-6 md:grid-cols-2"
        @submit.prevent="save"
      >
        <div class="flex flex-col gap-4">
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-2 text-sm font-medium">
              {{ $t('charts.editor.kind') }}
            </legend>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="option in kinds"
                :key="option.kind"
                type="button"
                class="flex flex-col items-center gap-1 rounded-md border p-2 text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                :class="
                  kind === option.kind && 'border-primary bg-accent font-medium'
                "
                :aria-pressed="kind === option.kind"
                @click="setKind(option.kind)"
              >
                <component
                  :is="option.icon"
                  class="size-5"
                  aria-hidden="true"
                />
                {{ $t(option.labelKey) }}
              </button>
            </div>
          </fieldset>

          <div class="flex flex-col gap-2">
            <Label for="chart-measure">{{ $t('charts.editor.measure') }}</Label>
            <div class="flex gap-2">
              <Select v-model="op">
                <SelectTrigger id="chart-measure" class="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in ops"
                    :key="option.op"
                    :value="option.op"
                  >
                    {{ $t(option.labelKey) }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select v-if="op !== 'count'" v-model="measureField">
                <SelectTrigger
                  class="min-w-0 flex-1"
                  :aria-label="$t('charts.editor.measureField')"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="field in measureOptions"
                    :key="field.id"
                    :value="field.id"
                  >
                    {{ field.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            v-if="kind === 'bar' || kind === 'pie'"
            class="flex flex-col gap-2"
          >
            <Label for="chart-group">{{ $t('charts.editor.groupBy') }}</Label>
            <Select v-if="groupable.length" v-model="groupBy">
              <SelectTrigger id="chart-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="field in groupable"
                  :key="field.id"
                  :value="field.id"
                >
                  {{ field.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-else class="text-sm text-muted-foreground">
              {{ $t('charts.editor.noGroupable') }}
            </p>
          </div>

          <template v-if="kind === 'line'">
            <div class="flex flex-col gap-2">
              <Label for="chart-source">{{ $t('charts.editor.over') }}</Label>
              <div class="flex gap-2">
                <Select v-model="source">
                  <SelectTrigger id="chart-source" class="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="addedAt">
                      {{ $t('charts.editor.whenAdded') }}
                    </SelectItem>
                    <SelectItem
                      v-for="field in dates"
                      :key="field.id"
                      :value="field.id"
                    >
                      {{ field.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select v-model="bucket">
                  <SelectTrigger
                    class="w-32"
                    :aria-label="$t('charts.editor.bucket')"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">
                      {{ $t('charts.editor.byMonth') }}
                    </SelectItem>
                    <SelectItem value="year">
                      {{ $t('charts.editor.byYear') }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Label class="flex items-center gap-2 font-normal">
              <Checkbox v-model="cumulative" />
              {{ $t('charts.editor.cumulative') }}
            </Label>
          </template>

          <div class="flex flex-col gap-2">
            <Label for="chart-title">{{ $t('charts.editor.title') }}</Label>
            <Input
              id="chart-title"
              v-model="title"
              maxlength="80"
              :placeholder="$t('charts.editor.titlePlaceholder')"
            />
          </div>

          <div class="flex flex-col gap-2">
            <Label for="chart-size">{{ $t('charts.size') }}</Label>
            <Select v-model="size">
              <SelectTrigger id="chart-size" class="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">{{
                  $t('charts.sizes.small')
                }}</SelectItem>
                <SelectItem value="medium">{{
                  $t('charts.sizes.medium')
                }}</SelectItem>
                <SelectItem value="large">{{
                  $t('charts.sizes.large')
                }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <p class="text-sm font-medium">{{ $t('charts.editor.preview') }}</p>
          <div class="min-h-72">
            <ChartCard :widget="draft" :fields="fields" :items="items" />
          </div>
        </div>
      </form>

      <FormMessage v-if="missing">{{ $t(missing.key) }}</FormMessage>

      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">
          {{ $t('charts.editor.cancel') }}
        </Button>
        <Button type="submit" form="chart-form" :disabled="!!missing">
          {{ widget ? $t('charts.editor.save') : $t('charts.editor.add') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
