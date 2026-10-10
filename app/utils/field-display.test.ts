import { describe, expect, it } from 'vitest'
import type { FieldDefinition, FieldType } from '#shared/types/collection'
import { compareFieldValues, formatFieldValue } from './field-display'

const field = (type: FieldType): FieldDefinition => ({
  id: 'f',
  name: 'Field',
  type,
})

describe('formatFieldValue', () => {
  it('shows nothing for an empty value', () => {
    expect(formatFieldValue(field('text'), undefined)).toBe('')
  })

  it('formats numbers and amounts for the language', () => {
    expect(formatFieldValue(field('number'), 1234.5)).toBe('1,234.5')
    expect(formatFieldValue(field('currency'), 40)).toBe('40.00')
    expect(formatFieldValue(field('currency'), 1234.5, 'de')).toBe('1.234,50')
  })

  it('shows progress as a percentage and dates in words', () => {
    expect(formatFieldValue(field('progress'), 75)).toBe('75%')
    expect(formatFieldValue(field('date'), '1995-03-11')).toBe('March 11, 1995')
  })

  it('shows text, selects, ratings and checkboxes as they are', () => {
    expect(formatFieldValue(field('text'), 'Mint')).toBe('Mint')
    expect(formatFieldValue(field('rating'), 4)).toBe('4')
    expect(formatFieldValue(field('checkbox'), true)).toBe('true')
  })
})

describe('compareFieldValues', () => {
  const sorted = (type: FieldType, values: (string | number | boolean)[]) =>
    [...values].sort((a, b) => compareFieldValues(field(type), a, b))

  it('sorts numbers numerically, not as text', () => {
    expect(sorted('number', [10, 9, 100])).toEqual([9, 10, 100])
    expect(sorted('currency', [19.99, 5, 120])).toEqual([5, 19.99, 120])
  })

  it('sorts text ignoring case, with numbers in order', () => {
    expect(sorted('text', ['b', 'A', 'Mega Man 10', 'Mega Man 2'])).toEqual([
      'A',
      'b',
      'Mega Man 2',
      'Mega Man 10',
    ])
  })

  it('sorts dates in order and puts ticked checkboxes first', () => {
    expect(sorted('date', ['2001-01-02', '1999-12-31'])).toEqual([
      '1999-12-31',
      '2001-01-02',
    ])
    expect(sorted('checkbox', [false, true])).toEqual([true, false])
  })
})
