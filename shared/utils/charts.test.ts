import { describe, expect, it } from 'vitest'
import type { ChartWidget } from '../types/charts'
import type { FieldDefinition } from '../types/collection'
import {
  chartProblem,
  defaultTitle,
  groupValues,
  measureValue,
  timeSeries,
  type ChartItem,
} from './charts'

const fields: FieldDefinition[] = [
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: ['Backlog', 'Playing', 'Finished'],
  },
  {
    id: 'genres',
    name: 'Genres',
    type: 'multiselect',
    options: ['RPG', 'Action'],
  },
  { id: 'price', name: 'Price', type: 'currency', currency: 'USD' },
  { id: 'score', name: 'Score', type: 'rating' },
  { id: 'beaten', name: 'Beaten', type: 'checkbox' },
  { id: 'bought', name: 'Bought on', type: 'date' },
  { id: 'platform', name: 'Platform', type: 'text' },
]

const item = (data: ChartItem['data'], addedAt = '2026-01-15T00:00:00Z') => ({
  data,
  addedAt,
})

const items: ChartItem[] = [
  item({
    status: 'Finished',
    price: 40,
    score: 5,
    beaten: true,
    genres: ['RPG'],
  }),
  item({ status: 'Playing', price: 20, score: 3, genres: ['RPG', 'Action'] }),
  item({ status: 'Finished', beaten: true }, '2026-03-02T00:00:00Z'),
  item({}, '2026-03-20T00:00:00Z'),
]

const widget = (patch: Partial<ChartWidget>): ChartWidget => ({
  id: 'w',
  kind: 'number',
  title: '',
  size: 'small',
  measure: { op: 'count' },
  ...patch,
})

describe('measureValue', () => {
  it('counts, adds up and averages', () => {
    expect(measureValue(items, { op: 'count' })).toBe(4)
    expect(measureValue(items, { op: 'sum', fieldId: 'price' })).toBe(60)
    expect(measureValue(items, { op: 'average', fieldId: 'score' })).toBe(4)
    expect(measureValue(items, { op: 'min', fieldId: 'price' })).toBe(20)
    expect(measureValue(items, { op: 'max', fieldId: 'price' })).toBe(40)
  })

  it('gives the share of games ticked', () => {
    expect(measureValue(items, { op: 'percent', fieldId: 'beaten' })).toBe(50)
  })

  it('has nothing to average when no game has a value', () => {
    expect(
      measureValue([item({})], { op: 'average', fieldId: 'score' }),
    ).toBeNull()
    expect(measureValue([item({})], { op: 'sum', fieldId: 'price' })).toBe(0)
    expect(measureValue([], { op: 'percent', fieldId: 'beaten' })).toBeNull()
  })
})

describe('groupValues', () => {
  const labels = (groups: ReturnType<typeof groupValues>) =>
    groups.map((group) =>
      group.label.kind === 'value' ? group.label.text : `(${group.label.kind})`,
    )

  it('keeps choices in the field order, with unset games last', () => {
    const groups = groupValues(
      items,
      fields,
      widget({ kind: 'bar', groupBy: 'status' }),
    )
    expect(labels(groups)).toEqual(['Playing', 'Finished', '(none)'])
    expect(groups.map((group) => group.value)).toEqual([1, 2, 1])
  })

  it('counts a game in each of its choices', () => {
    const groups = groupValues(
      items,
      fields,
      widget({ kind: 'pie', groupBy: 'genres' }),
    )
    expect(labels(groups)).toEqual(['RPG', 'Action', '(none)'])
    expect(groups.map((group) => group.value)).toEqual([2, 1, 2])
  })

  it('splits by a checkbox, ticked first, and can add up a field', () => {
    const groups = groupValues(
      items,
      fields,
      widget({
        kind: 'bar',
        groupBy: 'beaten',
        measure: { op: 'sum', fieldId: 'price' },
      }),
    )
    expect(labels(groups)).toEqual(['(yes)', '(none)'])
    expect(groups.map((group) => group.value)).toEqual([40, 20])
  })

  it('lumps small text groups into Other past the limit', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      item({ platform: `P${i}` }),
    )
    many.push(item({ platform: 'P0' }), item({ platform: 'P0' }))
    const groups = groupValues(
      many,
      fields,
      widget({ kind: 'bar', groupBy: 'platform' }),
    )
    expect(groups).toHaveLength(12)
    expect(labels(groups)[0]).toBe('P0')
    expect(groups[0]!.value).toBe(3)
    expect(groups.at(-1)).toEqual({ label: { kind: 'other' }, value: 4 })
  })
})

describe('timeSeries', () => {
  it('fills in empty months between the first and last', () => {
    const points = timeSeries(
      items,
      widget({
        kind: 'line',
        timeline: { source: 'addedAt', bucket: 'month', cumulative: false },
      }),
    )
    expect(points).toEqual([
      { bucket: '2026-01', value: 2 },
      { bucket: '2026-02', value: 0 },
      { bucket: '2026-03', value: 2 },
    ])
  })

  it('can show a running total, by year, from a date field', () => {
    const dated = [
      item({ bought: '2024-05-01', price: 10 }),
      item({ bought: '2026-02-01', price: 5 }),
      item({ price: 99 }),
    ]
    const points = timeSeries(
      dated,
      widget({
        kind: 'line',
        measure: { op: 'sum', fieldId: 'price' },
        timeline: { source: 'bought', bucket: 'year', cumulative: true },
      }),
    )
    expect(points).toEqual([
      { bucket: '2024', value: 10 },
      { bucket: '2025', value: 10 },
      { bucket: '2026', value: 15 },
    ])
  })
})

describe('chartProblem', () => {
  it('accepts charts whose fields still fit', () => {
    expect(
      chartProblem(widget({ kind: 'bar', groupBy: 'status' }), fields),
    ).toBeNull()
  })

  it('notices a removed or retyped field', () => {
    expect(
      chartProblem(widget({ measure: { op: 'sum', fieldId: 'gone' } }), fields),
    ).toEqual({ key: 'charts.problems.fieldGone' })
    expect(
      chartProblem(
        widget({ measure: { op: 'sum', fieldId: 'status' } }),
        fields,
      ),
    ).not.toBeNull()
    expect(
      chartProblem(
        widget({
          kind: 'line',
          timeline: { source: 'status', bucket: 'month', cumulative: false },
        }),
        fields,
      ),
    ).not.toBeNull()
  })
})

describe('defaultTitle', () => {
  it('reads from the settings', () => {
    expect(defaultTitle(widget({}), fields).key).toBe('charts.titles.count')
    expect(
      defaultTitle(
        widget({
          kind: 'bar',
          groupBy: 'status',
          measure: { op: 'sum', fieldId: 'price' },
        }),
        fields,
      ),
    ).toEqual({
      key: 'charts.titles.sumBy',
      params: { field: 'Price', group: 'Status' },
    })
  })
})
