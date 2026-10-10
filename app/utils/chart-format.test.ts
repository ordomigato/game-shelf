import { describe, expect, it } from 'vitest'
import type { FieldDefinition } from '#shared/types/collection'
import { formatBucket, formatMeasure } from './chart-format'

const fields: FieldDefinition[] = [
  { id: 'price', name: 'Price', type: 'currency', currency: 'USD' },
  { id: 'stars', name: 'Stars', type: 'rating' },
  { id: 'score', name: 'Score', type: 'rating', scale: 10 },
  { id: 'done', name: 'Done', type: 'progress' },
  { id: 'hours', name: 'Hours', type: 'number' },
]

describe('formatMeasure', () => {
  it('formats counts, shares and nothing', () => {
    expect(formatMeasure(1234, { op: 'count' }, fields)).toBe('1,234')
    expect(formatMeasure(66.6, { op: 'percent', fieldId: 'x' }, fields)).toBe(
      '67%',
    )
    expect(
      formatMeasure(null, { op: 'average', fieldId: 'hours' }, fields),
    ).toBe('–')
  })

  it('formats each field type its own way', () => {
    expect(formatMeasure(60, { op: 'sum', fieldId: 'price' }, fields)).toBe(
      '$60.00',
    )
    expect(
      formatMeasure(4.25, { op: 'average', fieldId: 'stars' }, fields),
    ).toBe('4.3 ★')
    expect(
      formatMeasure(7.5, { op: 'average', fieldId: 'score' }, fields),
    ).toBe('7.5/10')
    expect(
      formatMeasure(42.4, { op: 'average', fieldId: 'done' }, fields),
    ).toBe('42%')
    expect(
      formatMeasure(12.34, { op: 'average', fieldId: 'hours' }, fields),
    ).toBe('12.3')
  })
})

describe('formatBucket', () => {
  it('names months and years', () => {
    expect(formatBucket('2026-03')).toBe('Mar 2026')
    expect(formatBucket('2026')).toBe('2026')
  })
})
