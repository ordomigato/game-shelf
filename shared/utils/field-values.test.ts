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
