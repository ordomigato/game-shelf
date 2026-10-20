import { describe, expect, it } from 'vitest'
import type { ChartWidget } from '../types/charts'
import type { FieldDefinition } from '../types/collection'
import {
  chartProblem,
  defaultTitle,
  groupValues,
  measureValue,
  suggestCharts,
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

describe('core columns', () => {
  const platforms = [
    { id: 19, name: 'SNES' },
    { id: 130, name: 'Switch' },
  ]
  const game = (extra: Partial<ChartItem>): ChartItem => ({
    data: {},
    addedAt: '2026-01-15T00:00:00Z',
    ...extra,
  })
  const games = [
    game({
      releaseDate: '1995-03-11',
      releasePrecision: 'day',
      genres: ['RPG', 'Puzzle'],
      catalogPlatforms: platforms,
      ownedOn: [19, 130],
    }),
    game({
      releaseDate: '1995-01-01',
      releasePrecision: 'year',
      genres: ['RPG'],
      catalogPlatforms: platforms,
      ownedOn: [19],
      // Wishlisted platforms are not owned ones.
    }),
    game({
      releaseDate: '2001-06-01',
      releasePrecision: 'month',
      genres: ['Action'],
    }),
    game({ releasePrecision: 'tbd', releaseDate: '2030-01-01' }),
    // Added by hand: no catalog facts.
    game({}),
  ]
  const labels = (groups: ReturnType<typeof groupValues>) =>
    groups.map((group) =>
      group.label.kind === 'value' ? group.label.text : `(${group.label.kind})`,
    )
  const split = (groupBy: string) =>
    groupValues(games, [], widget({ kind: 'bar', groupBy }))

  it('splits by genre, a game in each of its genres, largest first', () => {
    const groups = split('genre')
    expect(labels(groups)).toEqual(['RPG', 'Puzzle', 'Action', '(none)'])
    expect(groups.map((group) => group.value)).toEqual([2, 1, 1, 2])
  })

  it('splits by the platforms a game is owned on', () => {
    const groups = split('platforms')
    expect(labels(groups)).toEqual(['SNES', 'Switch', '(none)'])
    expect(groups.map((group) => group.value)).toEqual([2, 1, 3])
  })

  it('splits by release year, oldest first, games without a date last', () => {
    const groups = split('releaseYear')
    expect(labels(groups)).toEqual(['1995', '2001', '(none)'])
    expect(groups.map((group) => group.value)).toEqual([2, 1, 2])
  })

  it('draws charts split by a core column, and not by a made-up one', () => {
    for (const id of ['genre', 'platforms', 'releaseYear']) {
      expect(chartProblem(widget({ kind: 'pie', groupBy: id }), [])).toBeNull()
    }
    expect(chartProblem(widget({ kind: 'pie', groupBy: 'size' }), [])).toEqual({
      key: 'charts.problems.fieldGone',
    })
  })

  it('spreads games over time by release date', () => {
    const line = (bucket: 'month' | 'year') =>
      widget({
        kind: 'line',
        timeline: { source: 'released', bucket, cumulative: false },
      })
    expect(chartProblem(line('year'), [])).toBeNull()
    expect(timeSeries(games, line('year')).slice(0, 1)).toEqual([
      { bucket: '1995', value: 2 },
    ])
    // A game known only to its year has no month, and TBD has no date.
    const months = timeSeries(games, line('month'))
    expect(months[0]).toEqual({ bucket: '1995-03', value: 1 })
    expect(months.reduce((total, point) => total + point.value, 0)).toBe(2)
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

describe('suggestCharts', () => {
  let n = 0
  const newId = () => `s${++n}`

  it('suggests charts that suit the fields', () => {
    const kinds = suggestCharts(fields, [], newId).map((widget) => [
      widget.kind,
      widget.measure.op,
      widget.groupBy ?? widget.timeline?.source ?? '',
    ])
    expect(kinds).toEqual([
      ['number', 'count', ''],
      ['number', 'sum', ''],
      ['number', 'average', ''],
      ['number', 'percent', ''],
      ['pie', 'count', 'status'],
      ['pie', 'count', 'genres'],
      ['line', 'count', 'addedAt'],
      ['bar', 'count', 'genre'],
    ])
  })

  it('uses bars when a choice list has many choices', () => {
    const many: FieldDefinition[] = [
      {
        id: 'platform',
        name: 'Platform',
        type: 'select',
        options: ['A', 'B', 'C', 'D', 'E', 'F'],
      },
    ]
    const bar = suggestCharts(many, [], newId).find((w) => w.groupBy)
    expect(bar).toMatchObject({ kind: 'bar', size: 'medium' })
  })

  it('leaves out charts already on the dashboard, whatever they are called', () => {
    const existing = [widget({ id: 'mine', title: 'My games', size: 'large' })]
    const suggested = suggestCharts(fields, existing, newId)
    expect(
      suggested.some((w) => w.kind === 'number' && w.measure.op === 'count'),
    ).toBe(false)
  })

  it('always offers the game count, genres and growth, even with no fields', () => {
    expect(suggestCharts([], [], newId).map((w) => w.kind)).toEqual([
      'number',
      'line',
      'bar',
    ])
  })

  it('offers games by genre once, then leaves it out', () => {
    const genre = suggestCharts([], [], newId).find(
      (w) => w.groupBy === 'genre',
    )!
    expect(defaultTitle(genre, [], (core) => `the ${core}`)).toEqual({
      key: 'charts.titles.countBy',
      params: { field: '', group: 'the genre' },
    })
    expect(
      suggestCharts([], [genre], newId).some((w) => w.groupBy === 'genre'),
    ).toBe(false)
  })
})
