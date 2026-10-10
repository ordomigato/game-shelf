import type { ChartMeasure, ChartTimeline, ChartWidget } from '../types/charts'
import type {
  FieldDefinition,
  FieldType,
  FieldValue,
  ItemData,
} from '../types/collection'
import type { Message } from '../types/message'

/** A game as charts see it: its values, and when it joined the collection. */
export interface ChartItem {
  data: ItemData
  addedAt: string
}

export const MAX_CHARTS = 24
/** Bar and pie charts show this many groups, then lump the rest as "Other". */
export const MAX_GROUPS = 12

const NUMERIC: FieldType[] = ['number', 'currency', 'rating', 'progress']
const GROUPABLE: FieldType[] = [
  'select',
  'multiselect',
  'checkbox',
  'rating',
  'text',
]

/** Fields a chart can add up or average. */
export const numericFields = (fields: FieldDefinition[]) =>
  fields.filter((field) => NUMERIC.includes(field.type))

/** Fields whose values can split games into groups. */
export const groupableFields = (fields: FieldDefinition[]) =>
  fields.filter((field) => GROUPABLE.includes(field.type))

/** Fields a "share of games ticked" chart can use. */
export const checkboxFields = (fields: FieldDefinition[]) =>
  fields.filter((field) => field.type === 'checkbox')

/** Date fields, for charts over time (besides when games were added). */
export const dateFields = (fields: FieldDefinition[]) =>
  fields.filter((field) => field.type === 'date')

const byId = (fields: FieldDefinition[], id: string | undefined) =>
  fields.find((field) => field.id === id)

/**
 * Why a chart can't be drawn with these fields, or null when it can. Fields
 * change after a chart is made, so this is checked every time it's shown.
 */
export function chartProblem(
  widget: ChartWidget,
  fields: FieldDefinition[],
): Message | null {
  const { measure } = widget
  if (measure.op === 'percent') {
    if (byId(fields, measure.fieldId)?.type !== 'checkbox') {
      return { key: 'charts.problems.fieldGone' }
    }
  } else if (measure.op !== 'count') {
    const field = byId(fields, measure.fieldId)
    if (!field || !NUMERIC.includes(field.type)) {
      return { key: 'charts.problems.fieldGone' }
    }
  }
  if (widget.kind === 'bar' || widget.kind === 'pie') {
    const group = byId(fields, widget.groupBy)
    if (!group || !GROUPABLE.includes(group.type)) {
      return { key: 'charts.problems.fieldGone' }
    }
  }
  if (widget.kind === 'line') {
    const source = widget.timeline?.source
    if (
      !source ||
      (source !== 'addedAt' && byId(fields, source)?.type !== 'date')
    ) {
      return { key: 'charts.problems.fieldGone' }
    }
  }
  return null
}

/**
 * The measure for a set of games. Null when there's nothing to measure,
 * like an average of a field no game has filled in.
 */
export function measureValue(
  items: ChartItem[],
  measure: ChartMeasure,
): number | null {
  if (measure.op === 'count') return items.length
  if (measure.op === 'percent') {
    if (!items.length) return null
    const ticked = items.filter((item) => item.data[measure.fieldId] === true)
    return (ticked.length / items.length) * 100
  }
  const values = items
    .map((item) => item.data[measure.fieldId])
    .filter((value): value is number => typeof value === 'number')
  if (!values.length) return measure.op === 'sum' ? 0 : null
  switch (measure.op) {
    case 'sum':
      return values.reduce((total, value) => total + value, 0)
    case 'average':
      return values.reduce((total, value) => total + value, 0) / values.length
    case 'min':
      return Math.min(...values)
    case 'max':
      return Math.max(...values)
  }
}

/** A group's label: a value, or one of the labels charts put into words. */
export type GroupLabel =
  { kind: 'value'; text: string } | { kind: 'yes' | 'no' | 'none' | 'other' }

export interface ChartGroup {
  label: GroupLabel
  value: number
}

function groupKeys(field: FieldDefinition, value: FieldValue | undefined) {
  if (value === undefined || value === '') return ['\u0000none']
  if (field.type === 'checkbox')
    return [value === true ? '\u0000yes' : '\u0000no']
  if (Array.isArray(value)) return value.length ? value : ['\u0000none']
  return [String(value)]
}

function labelFor(key: string): GroupLabel {
  if (key === '\u0000none') return { kind: 'none' }
  if (key === '\u0000yes') return { kind: 'yes' }
  if (key === '\u0000no') return { kind: 'no' }
  return { kind: 'value', text: key }
}

/**
 * Bar and pie data: the games split by a field's values, each group
 * measured. A game with several choices counts in each. Choices keep the
 * field's order, scores go low to high, text goes largest first. Past
 * MAX_GROUPS, the smallest groups become "Other". Games with no value come
 * last, as "Not set".
 */
export function groupValues(
  items: ChartItem[],
  fields: FieldDefinition[],
  widget: ChartWidget,
): ChartGroup[] {
  const field = byId(fields, widget.groupBy)
  if (!field) return []
  const groups = new Map<string, ChartItem[]>()
  for (const item of items) {
    for (const key of groupKeys(field, item.data[field.id])) {
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
  }
  const none = groups.get('\u0000none')
  groups.delete('\u0000none')

  const keys = [...groups.keys()]
  if (field.type === 'select' || field.type === 'multiselect') {
    const order = field.options ?? []
    keys.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  } else if (field.type === 'rating') {
    keys.sort((a, b) => Number(a) - Number(b))
  } else if (field.type === 'checkbox') {
    keys.sort((a) => (a === '\u0000yes' ? -1 : 1))
  }

  let kept = keys
  if (keys.length > MAX_GROUPS) {
    // Keep the largest groups, in their usual order, and lump the rest.
    const sizes = new Map(
      keys.map((key) => [
        key,
        measureValue(groups.get(key)!, widget.measure) ?? 0,
      ]),
    )
    const largest = new Set(
      [...keys]
        .sort((a, b) => sizes.get(b)! - sizes.get(a)!)
        .slice(0, MAX_GROUPS - 1),
    )
    kept = keys.filter((key) => largest.has(key))
  }
  const result: ChartGroup[] = kept.map((key) => ({
    label: labelFor(key),
    value: measureValue(groups.get(key)!, widget.measure) ?? 0,
  }))
  if (field.type === 'text') result.sort((a, b) => b.value - a.value)
  if (kept.length < keys.length) {
    const keptSet = new Set(kept)
    const rest = new Set(
      keys
        .filter((key) => !keptSet.has(key))
        .flatMap((key) => groups.get(key)!),
    )
    result.push({
      label: { kind: 'other' },
      value: measureValue([...rest], widget.measure) ?? 0,
    })
  }
  if (none?.length) {
    result.push({
      label: { kind: 'none' },
      value: measureValue(none, widget.measure) ?? 0,
    })
  }
  return result
}

export interface ChartPoint {
  /** `YYYY-MM` or `YYYY`. */
  bucket: string
  value: number
}

function bucketOf(date: string, bucket: ChartTimeline['bucket']) {
  return bucket === 'year' ? date.slice(0, 4) : date.slice(0, 7)
}

function nextBucket(current: string, bucket: ChartTimeline['bucket']) {
  if (bucket === 'year') return String(Number(current) + 1)
  const [year, month] = current.split('-').map(Number) as [number, number]
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`
}

/**
 * Line data: the games spread over months or years, by when they were
 * added or by a date field, each period measured. Empty periods between
 * the first and last are filled in, so the line doesn't skip time. Games
 * without a date are left out.
 */
export function timeSeries(
  items: ChartItem[],
  widget: ChartWidget,
): ChartPoint[] {
  const timeline = widget.timeline
  if (!timeline) return []
  const dated = items.flatMap((item) => {
    const raw =
      timeline.source === 'addedAt'
        ? item.addedAt.slice(0, 10)
        : item.data[timeline.source]
    return typeof raw === 'string' && /^\d{4}-\d{2}/.test(raw)
      ? [{ item, bucket: bucketOf(raw, timeline.bucket) }]
      : []
  })
  if (!dated.length) return []
  const buckets = [...new Set(dated.map((entry) => entry.bucket))].sort()
  const last = buckets[buckets.length - 1]!
  const points: ChartPoint[] = []
  const seen: ChartItem[] = []
  for (
    let bucket = buckets[0]!;
    ;
    bucket = nextBucket(bucket, timeline.bucket)
  ) {
    const inBucket = dated
      .filter((entry) => entry.bucket === bucket)
      .map((entry) => entry.item)
    seen.push(...inBucket)
    const value = measureValue(
      timeline.cumulative ? seen : inBucket,
      widget.measure,
    )
    points.push({ bucket, value: value ?? 0 })
    if (bucket >= last || points.length > 1200) break
  }
  return points
}

type MeasureOp = ChartMeasure['op']

// Spelled out, so every message key is written somewhere (see i18n).
const TITLES: Record<
  'single' | 'by' | 'overTime',
  Record<MeasureOp, Message>
> = {
  single: {
    count: { key: 'charts.titles.count' },
    sum: { key: 'charts.titles.sum' },
    average: { key: 'charts.titles.average' },
    min: { key: 'charts.titles.min' },
    max: { key: 'charts.titles.max' },
    percent: { key: 'charts.titles.percent' },
  },
  by: {
    count: { key: 'charts.titles.countBy' },
    sum: { key: 'charts.titles.sumBy' },
    average: { key: 'charts.titles.averageBy' },
    min: { key: 'charts.titles.minBy' },
    max: { key: 'charts.titles.maxBy' },
    percent: { key: 'charts.titles.percentBy' },
  },
  overTime: {
    count: { key: 'charts.titles.countOverTime' },
    sum: { key: 'charts.titles.sumOverTime' },
    average: { key: 'charts.titles.averageOverTime' },
    min: { key: 'charts.titles.minOverTime' },
    max: { key: 'charts.titles.maxOverTime' },
    percent: { key: 'charts.titles.percentOverTime' },
  },
}

/** The title a chart gets from its settings, when it has none of its own. */
export function defaultTitle(
  widget: ChartWidget,
  fields: FieldDefinition[],
): Message {
  const fieldName = (id: string | undefined) => byId(fields, id)?.name ?? '?'
  const { measure } = widget
  const shape =
    widget.kind === 'bar' || widget.kind === 'pie'
      ? 'by'
      : widget.kind === 'line'
        ? 'overTime'
        : 'single'
  return {
    key: TITLES[shape][measure.op].key,
    params: {
      field: measure.op === 'count' ? '' : fieldName(measure.fieldId),
      group: fieldName(widget.groupBy),
    },
  }
}
