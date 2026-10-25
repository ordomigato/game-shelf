import { describe, expect, it } from 'vitest'
import type { Viewer } from './access'
import type { FieldDefinition, ItemData } from '../types/collection'
import type { ChartWidget } from '../types/charts'
import {
  applyFieldValues,
  chartsFor,
  dataFor,
  fieldsFor,
  normalizeFieldValue,
} from './field-values'
import { limitsFor } from './plans'

const asOwner: Viewer = {
  subject: { id: 'owner', roles: ['user'] },
  ownerId: 'owner',
}
const asVisitor: Viewer = { subject: null, ownerId: 'owner' }

const field = (type: FieldDefinition['type'], options?: string[]) =>
  ({ id: 'f', name: 'F', type, options }) as FieldDefinition

describe('normalizeFieldValue', () => {
  it('validates each type', () => {
    expect(normalizeFieldValue(field('text'), '  Boxed  ')).toBe('Boxed')
    expect(normalizeFieldValue(field('text'), 'x'.repeat(501))).toBeUndefined()
    expect(
      normalizeFieldValue(field('select', ['Loose', 'Sealed']), 'Sealed'),
    ).toBe('Sealed')
    expect(
      normalizeFieldValue(field('select', ['Loose']), 'Mint'),
    ).toBeUndefined()
    expect(normalizeFieldValue(field('date'), '2024-02-29')).toBe('2024-02-29')
    expect(normalizeFieldValue(field('date'), '2023-02-29')).toBeUndefined()
    expect(normalizeFieldValue(field('date'), '29/02/2024')).toBeUndefined()
    expect(normalizeFieldValue(field('checkbox'), true)).toBe(true)
    expect(normalizeFieldValue(field('checkbox'), 'yes')).toBeUndefined()
    expect(normalizeFieldValue(field('number'), -3.5)).toBe(-3.5)
    expect(normalizeFieldValue(field('number'), Number.NaN)).toBeUndefined()
    expect(normalizeFieldValue(field('currency'), 59.999)).toBe(60)
    expect(normalizeFieldValue(field('currency'), -1)).toBeUndefined()
    expect(normalizeFieldValue(field('rating'), 4)).toBe(4)
    expect(normalizeFieldValue(field('rating'), 4.5)).toBeUndefined()
    expect(normalizeFieldValue(field('rating'), 6)).toBeUndefined()
    expect(normalizeFieldValue(field('progress'), 72.6)).toBe(73)
    expect(normalizeFieldValue(field('progress'), 101)).toBeUndefined()
  })

  it('treats null as clearing, and empty text as clearing', () => {
    expect(normalizeFieldValue(field('rating'), null)).toBeNull()
    expect(normalizeFieldValue(field('text'), '   ')).toBeNull()
  })
})

describe('normalizeFieldValue text length', () => {
  const text = (length: number) => 'x'.repeat(length)
  const free = limitsFor('free').textLength
  const pro = limitsFor('pro').textLength

  it('refuses 501 characters on Free and takes 500', () => {
    expect(normalizeFieldValue(field('text'), text(500), free)).toBe(text(500))
    expect(normalizeFieldValue(field('text'), text(501), free)).toBeUndefined()
  })

  it('takes 2,000 characters on Pro and refuses 2,001', () => {
    expect(normalizeFieldValue(field('text'), text(2000), pro)).toBe(text(2000))
    expect(normalizeFieldValue(field('text'), text(2001), pro)).toBeUndefined()
  })

  it('follows a custom limit within the app maximum', () => {
    const raised = limitsFor('free', { textLength: 1200 }).textLength
    expect(normalizeFieldValue(field('text'), text(1200), raised)).toBe(
      text(1200),
    )
    expect(
      normalizeFieldValue(field('text'), text(1201), raised),
    ).toBeUndefined()
    const capped = limitsFor('pro', { textLength: 9000 }).textLength
    expect(
      normalizeFieldValue(field('text'), text(2001), capped),
    ).toBeUndefined()
  })

  it('applies the limit when saving several values', () => {
    const fields = [field('text')]
    const long = { f: text(600) }
    expect(applyFieldValues({}, fields, long, free)).toEqual({
      invalidFieldIds: ['f'],
    })
    expect(applyFieldValues({}, fields, long, pro)).toEqual({
      data: long,
    })
  })
})

describe('normalizeFieldValue for scores', () => {
  const stars = { id: 'r', name: 'Rating', type: 'rating' as const }
  it('takes whole stars from 1 to 5 by default', () => {
    expect(normalizeFieldValue(stars, 5)).toBe(5)
    expect(normalizeFieldValue(stars, 0)).toBeUndefined()
    expect(normalizeFieldValue(stars, 6)).toBeUndefined()
    expect(normalizeFieldValue(stars, 2.5)).toBeUndefined()
  })

  it('takes 0 up to a larger scale', () => {
    const outOf10 = { ...stars, scale: 10 as const }
    expect(normalizeFieldValue(outOf10, 0)).toBe(0)
    expect(normalizeFieldValue(outOf10, 10)).toBe(10)
    expect(normalizeFieldValue(outOf10, 11)).toBeUndefined()
    expect(normalizeFieldValue({ ...stars, scale: 100 as const }, 85)).toBe(85)
  })
})

describe('normalizeFieldValue for multiple choice', () => {
  const genres = {
    id: 'g',
    name: 'Genres',
    type: 'multiselect' as const,
    options: ['RPG', 'Action', 'Puzzle'],
  }

  it('keeps known choices once each, in the field order', () => {
    expect(normalizeFieldValue(genres, ['Puzzle', 'RPG', 'Puzzle'])).toEqual([
      'RPG',
      'Puzzle',
    ])
  })

  it('treats an empty list as clearing', () => {
    expect(normalizeFieldValue(genres, [])).toBeNull()
  })

  it('rejects unknown choices and anything that is not a list of text', () => {
    expect(normalizeFieldValue(genres, ['RPG', 'Racing'])).toBeUndefined()
    expect(normalizeFieldValue(genres, 'RPG')).toBeUndefined()
    expect(normalizeFieldValue(genres, [1])).toBeUndefined()
  })
})

describe('applyFieldValues', () => {
  const fields: FieldDefinition[] = [
    { id: 'price', name: 'Price', type: 'currency' },
    { id: 'rating', name: 'Rating', type: 'rating' },
  ]

  it('sets, clears and keeps values for other keys', () => {
    const result = applyFieldValues(
      { price: 10, rating: 3, otherField: 'keep me' },
      fields,
      { price: 12.5, rating: null },
    )
    expect(result).toEqual({
      data: { price: 12.5, otherField: 'keep me' },
    })
  })

  it('rejects unknown fields and wrong types, changing nothing', () => {
    expect(
      applyFieldValues({}, fields, { price: 'free', sneaky: 1, rating: 5 }),
    ).toEqual({ invalidFieldIds: ['price', 'sneaky'] })
  })
})

describe('fieldsFor', () => {
  const all: FieldDefinition[] = [
    { id: 'a', name: 'Notes', type: 'text' },
    { id: 'b', name: 'Price', type: 'number' },
    { id: 'c', name: 'Region', type: 'text' },
    { id: 'd', name: 'Hours', type: 'number' },
    { id: 'e', name: 'Added', type: 'date' },
  ]
  const items: { data: ItemData }[] = [
    { data: { a: 'hi' } },
    { data: { b: 5 } },
  ]
  const widget = (extra: Partial<ChartWidget>): ChartWidget => ({
    id: 'w',
    kind: 'number',
    title: '',
    size: 'small',
    measure: { op: 'count' },
    ...extra,
  })

  it('gives the owner every field', () => {
    expect(fieldsFor(asOwner, all, items, [])).toEqual(all)
  })

  it('gives a visitor only fields with a value in the collection', () => {
    expect(fieldsFor(asVisitor, all, items, []).map((f) => f.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('also keeps fields a chart uses, in the owner’s order', () => {
    const dashboard = [
      widget({ measure: { op: 'sum', fieldId: 'd' } }),
      widget({ kind: 'bar', groupBy: 'c' }),
      widget({
        kind: 'line',
        timeline: { source: 'e', bucket: 'month', cumulative: false },
      }),
    ]
    expect(
      fieldsFor(asVisitor, all, items, dashboard).map((f) => f.id),
    ).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('shows a visitor nothing when no game has a value', () => {
    expect(fieldsFor(asVisitor, all, [{ data: {} }], [])).toEqual([])
  })
})

describe('hidden fields', () => {
  const all: FieldDefinition[] = [
    { id: 'a', name: 'Notes', type: 'text' },
    { id: 'p', name: 'Price paid', type: 'currency', hidden: true },
  ]
  const widget = (extra: Partial<ChartWidget>): ChartWidget => ({
    id: 'w',
    kind: 'number',
    title: '',
    size: 'small',
    measure: { op: 'count' },
    ...extra,
  })
  const items: { data: ItemData }[] = [
    { data: { a: 'hi', p: 60 } },
    { data: { p: 20 } },
  ]

  it('never lists a hidden field to a visitor, even with values or a chart', () => {
    const dashboard = [widget({ measure: { op: 'sum', fieldId: 'p' } })]
    expect(
      fieldsFor(asVisitor, all, items, dashboard).map((f) => f.id),
    ).toEqual(['a'])
  })

  it('gives the owner hidden fields too', () => {
    expect(fieldsFor(asOwner, all, items, [])).toEqual(all)
  })

  it('leaves out charts that read a hidden field for a visitor only', () => {
    const total = widget({ id: '1', measure: { op: 'sum', fieldId: 'p' } })
    const byPrice = widget({ id: '2', kind: 'bar', groupBy: 'p' })
    const overTime = widget({
      id: '3',
      kind: 'line',
      timeline: { source: 'p', bucket: 'month', cumulative: false },
    })
    const count = widget({ id: '4' })
    const dashboard = [total, byPrice, overTime, count]
    expect(chartsFor(asVisitor, all, dashboard)).toEqual([count])
    expect(chartsFor(asOwner, all, dashboard)).toEqual(dashboard)
  })

  it('keeps platforms charts for visitors, who are sent the platforms', () => {
    const byPlatform = widget({ id: '5', kind: 'bar', groupBy: 'platforms' })
    const byGenre = widget({ id: '6', kind: 'bar', groupBy: 'genre' })
    expect(chartsFor(asVisitor, all, [byPlatform, byGenre])).toEqual([
      byPlatform,
      byGenre,
    ])
    expect(chartsFor(asOwner, all, [byPlatform, byGenre])).toEqual([
      byPlatform,
      byGenre,
    ])
  })

  it('strips item data down to the visible fields for a visitor', () => {
    const visible = fieldsFor(asVisitor, all, items, [])
    expect(dataFor(asVisitor, visible, { a: 'hi', p: 60, gone: 'x' })).toEqual({
      a: 'hi',
    })
    const data = { a: 'hi', p: 60 }
    expect(dataFor(asOwner, all, data)).toBe(data)
  })
})

describe('hidden fields', () => {
  const fields: FieldDefinition[] = [
    { id: 'a', name: 'Notes', type: 'text' },
    { id: 'p', name: 'Price paid', type: 'number', hidden: true },
  ]
  const items: { data: ItemData }[] = [{ data: { a: 'hi', p: 60 } }]
  const price: ChartWidget = {
    id: 'w',
    kind: 'number',
    title: '',
    size: 'small',
    measure: { op: 'sum', fieldId: 'p' },
  }
  const viewers: [string, Viewer, boolean][] = [
    ['the owner', asOwner, true],
    ['a visitor', asVisitor, false],
    [
      'another user',
      { subject: { id: 'other', roles: ['user'] }, ownerId: 'owner' },
      false,
    ],
    [
      'an admin',
      { subject: { id: 'admin', roles: ['user', 'admin'] }, ownerId: 'owner' },
      false,
    ],
  ]

  for (const [who, viewer, seesHidden] of viewers) {
    it(`${seesHidden ? 'shows' : 'keeps'} a hidden field ${seesHidden ? 'to' : 'from'} ${who}`, () => {
      const shown = fieldsFor(viewer, fields, items, [price]).map((f) => f.id)
      expect(shown).toEqual(seesHidden ? ['a', 'p'] : ['a'])
      expect(chartsFor(viewer, fields, [price])).toHaveLength(
        seesHidden ? 1 : 0,
      )
    })
  }
})
