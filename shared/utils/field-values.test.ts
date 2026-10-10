import { describe, expect, it } from 'vitest'
import type { FieldDefinition } from '../types/collection'
import { applyFieldValues, normalizeFieldValue } from './field-values'

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

describe('applyFieldValues', () => {
  const fields: FieldDefinition[] = [
    { id: 'price', name: 'Price', type: 'currency' },
    { id: 'rating', name: 'Rating', type: 'rating' },
  ]

  it('sets, clears and keeps other blueprints’ values', () => {
    const result = applyFieldValues(
      { price: 10, rating: 3, otherBlueprintField: 'keep me' },
      fields,
      { price: 12.5, rating: null },
    )
    expect(result).toEqual({
      data: { price: 12.5, otherBlueprintField: 'keep me' },
    })
  })

  it('rejects unknown fields and wrong types, changing nothing', () => {
    expect(
      applyFieldValues({}, fields, { price: 'free', sneaky: 1, rating: 5 }),
    ).toEqual({ invalidFieldIds: ['price', 'sneaky'] })
  })
})
