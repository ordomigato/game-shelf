import { describe, expect, it } from 'vitest'
import type { FieldDefinition, ItemData } from '../types/collection'
import {
  carryValue,
  cleanFields,
  fieldsProblem,
  MAX_FIELDS,
  MAX_SELECT_OPTIONS,
  migrateItemData,
  valuesLost,
} from './field-changes'

const text: FieldDefinition = { id: 't', name: 'Notes', type: 'text' }
const number: FieldDefinition = { id: 'n', name: 'Hours', type: 'number' }
const status: FieldDefinition = {
  id: 's',
  name: 'Status',
  type: 'select',
  options: ['Backlog', 'Playing', 'Finished'],
}

describe('fieldsProblem', () => {
  it('accepts a normal set of fields', () => {
    expect(fieldsProblem([text, number, status])).toBeNull()
  })

  it('needs names, unique regardless of case', () => {
    expect(fieldsProblem([{ ...text, name: '  ' }])?.key).toBe(
      'fieldEditor.errors.nameRequired',
    )
    expect(fieldsProblem([text, { ...number, name: 'notes' }])?.key).toBe(
      'fieldEditor.errors.duplicateName',
    )
  })

  it('needs select options that are filled in and unique', () => {
    expect(fieldsProblem([{ ...status, options: [] }])?.key).toBe(
      'fieldEditor.errors.optionsRequired',
    )
    expect(fieldsProblem([{ ...status, options: ['A', ''] }])?.key).toBe(
      'fieldEditor.errors.optionsRequired',
    )
    expect(fieldsProblem([{ ...status, options: ['A', 'a'] }])?.key).toBe(
      'fieldEditor.errors.duplicateOption',
    )
  })

  it('rejects a currency that is not a code', () => {
    expect(
      fieldsProblem([
        { id: 'c', name: 'Price', type: 'currency', currency: 'usd' },
      ])?.key,
    ).toBe('fieldEditor.errors.invalid')
  })

  it('caps the number of fields', () => {
    const many = Array.from({ length: 31 }, (_, i) => ({
      ...text,
      id: `f${i}`,
      name: `Field ${i}`,
    }))
    expect(fieldsProblem(many)?.key).toBe('fieldEditor.errors.tooMany')
  })
})

describe('cleanFields', () => {
  it('trims names and keeps only the extras a type uses', () => {
    expect(
      cleanFields([
        { id: 'a', name: ' Price ', type: 'currency', options: ['x'] },
        {
          id: 'b',
          name: 'Kind',
          type: 'select',
          options: [' A '],
          currency: 'EUR',
        },
      ]),
    ).toEqual([
      { id: 'a', name: 'Price', type: 'currency', currency: 'USD' },
      { id: 'b', name: 'Kind', type: 'select', options: ['A'] },
    ])
  })
})

describe('carryValue', () => {
  it('keeps values that still fit', () => {
    expect(carryValue(12, number, number)).toBe(12)
    expect(carryValue('Playing', status, status)).toBe('Playing')
  })

  it('follows a renamed select option', () => {
    const renamed = {
      ...status,
      options: ['Backlog', 'Now playing', 'Finished'],
    }
    expect(
      carryValue('Playing', status, renamed, { Playing: 'Now playing' }),
    ).toBe('Now playing')
  })

  it('drops a value whose option was removed', () => {
    const fewer = { ...status, options: ['Backlog', 'Finished'] }
    expect(carryValue('Playing', status, fewer)).toBeUndefined()
  })

  it('turns anything into text', () => {
    expect(carryValue(12.5, number, { ...number, type: 'text' })).toBe('12.5')
    expect(carryValue('Playing', status, { ...status, type: 'text' })).toBe(
      'Playing',
    )
  })

  it('moves numbers between number-like types when they fit', () => {
    expect(carryValue(19.999, number, { ...number, type: 'currency' })).toBe(20)
    expect(carryValue(4, number, { ...number, type: 'rating' })).toBe(4)
    expect(
      carryValue(40, number, { ...number, type: 'rating' }),
    ).toBeUndefined()
  })

  it('reads text as a number or an option when it matches', () => {
    expect(carryValue(' 30 ', text, { ...text, type: 'number' })).toBe(30)
    expect(
      carryValue('lots', text, { ...text, type: 'number' }),
    ).toBeUndefined()
    expect(carryValue('Finished', text, { ...status, id: 't' })).toBe(
      'Finished',
    )
    expect(carryValue('Done', text, { ...status, id: 't' })).toBeUndefined()
  })
})

describe('carryValue between score scales', () => {
  const stars: FieldDefinition = { id: 'r', name: 'Rating', type: 'rating' }
  it('keeps a score in proportion', () => {
    expect(carryValue(4, stars, { ...stars, scale: 10 })).toBe(8)
    expect(carryValue(4, stars, { ...stars, scale: 100 })).toBe(80)
    expect(carryValue(85, { ...stars, scale: 100 }, stars)).toBe(4)
  })

  it('never turns a score into zero stars', () => {
    expect(carryValue(0, { ...stars, scale: 10 }, stars)).toBe(1)
  })

  it('rejects an unknown scale', () => {
    expect(fieldsProblem([{ ...stars, scale: 7 as never }])?.key).toBe(
      'fieldEditor.errors.invalid',
    )
  })

  it('stores the scale, 5 when missing', () => {
    expect(cleanFields([stars])).toEqual([{ ...stars, scale: 5 }])
  })
})

describe('carryValue with multiple choice', () => {
  const genres: FieldDefinition = {
    id: 's',
    name: 'Genres',
    type: 'multiselect',
    options: ['Backlog', 'Playing', 'Finished'],
  }

  it('turns one choice into a list of one, losslessly', () => {
    expect(carryValue('Playing', status, genres)).toEqual(['Playing'])
  })

  it('keeps a list of one when going back to one choice', () => {
    expect(carryValue(['Finished'], genres, status)).toBe('Finished')
    expect(carryValue(['Backlog', 'Finished'], genres, status)).toBeUndefined()
  })

  it('renames choices and keeps the ones that survive', () => {
    const after = { ...genres, options: ['Backlog', 'On it'] }
    expect(
      carryValue(['Playing', 'Finished'], genres, after, { Playing: 'On it' }),
    ).toEqual(['On it'])
    expect(carryValue(['Finished'], genres, after)).toBeUndefined()
  })

  it('lists the choices as text', () => {
    expect(
      carryValue(['Backlog', 'Finished'], genres, { ...genres, type: 'text' }),
    ).toBe('Backlog, Finished')
  })
})

describe('migrateItemData', () => {
  const before = [text, number, status]

  it('returns null when nothing changes', () => {
    expect(migrateItemData({ n: 3, s: 'Backlog' }, before, before)).toBeNull()
  })

  it('drops removed fields and values that no longer fit', () => {
    const after = [{ ...number, type: 'rating' as const }, status]
    expect(
      migrateItemData(
        { t: 'Hi', n: 40, s: 'Playing', other: 1 },
        before,
        after,
      ),
    ).toEqual({ s: 'Playing', other: 1 })
  })

  it('renames options and leaves other keys alone', () => {
    const after = [
      text,
      number,
      { ...status, options: ['Backlog', 'On it', 'Finished'] },
    ]
    expect(
      migrateItemData({ s: 'Playing', x: 'y' }, before, after, {
        s: { Playing: 'On it' },
      }),
    ).toEqual({ s: 'On it', x: 'y' })
  })
})

describe('valuesLost with multiple choice', () => {
  it('counts a list that loses some of its choices', () => {
    const genres: FieldDefinition = {
      id: 'g',
      name: 'Genres',
      type: 'multiselect',
      options: ['RPG', 'Action'],
    }
    const items = [{ data: { g: ['RPG', 'Action'] } }, { data: { g: ['RPG'] } }]
    expect(
      valuesLost(items, [genres], [{ ...genres, options: ['RPG'] }]),
    ).toEqual(new Map([['g', 1]]))
  })

  it('does not count an unchanged list', () => {
    const genres: FieldDefinition = {
      id: 'g',
      name: 'Genres',
      type: 'multiselect',
      options: ['RPG'],
    }
    expect(
      migrateItemData({ g: ['RPG'] }, [genres], [{ ...genres }]),
    ).toBeNull()
  })
})

describe('valuesLost', () => {
  it('counts values each field would lose, ignoring renames', () => {
    const items: { data: ItemData }[] = [
      { data: { t: 'a', s: 'Playing' } },
      { data: { t: 'b', s: 'Backlog' } },
      { data: { n: 1 } },
    ]
    const after = [number, { ...status, options: ['Backlog', 'On it'] }]
    expect(
      valuesLost(items, [text, number, status], after, {
        s: { Playing: 'On it' },
      }),
    ).toEqual(new Map([['t', 2]]))
  })
})

describe('fixing fields that were merged into too many', () => {
  const plain = (i: number): FieldDefinition => ({
    id: `f${i}`,
    name: `Field ${i}`,
    type: 'text',
  })

  it('explains too many fields, and allows a save once enough are removed', () => {
    const fields = Array.from({ length: MAX_FIELDS + 3 }, (_, i) => plain(i))
    expect(fieldsProblem(fields)).toEqual({
      key: 'fieldEditor.errors.tooMany',
      params: { max: MAX_FIELDS },
    })
    expect(fieldsProblem(fields.slice(0, MAX_FIELDS + 1))).not.toBeNull()
    expect(fieldsProblem(fields.slice(0, MAX_FIELDS))).toBeNull()
  })

  it('explains too many choices, and allows removing some', () => {
    const options = Array.from(
      { length: MAX_SELECT_OPTIONS + 2 },
      (_, i) => `O${i}`,
    )
    const field: FieldDefinition = {
      id: 's',
      name: 'Tags',
      type: 'select',
      options,
    }
    expect(fieldsProblem([field])?.key).toBe(
      'fieldEditor.errors.tooManyOptions',
    )
    const fewer = options.slice(0, MAX_SELECT_OPTIONS)
    expect(fieldsProblem([{ ...field, options: fewer }])).toBeNull()
  })

  it('explains two fields with the same name, and allows renaming one', () => {
    const fields: FieldDefinition[] = [
      { id: 'a', name: 'Rating (2)', type: 'text' },
      { id: 'b', name: 'rating (2)', type: 'progress' },
    ]
    expect(fieldsProblem(fields)?.key).toBe('fieldEditor.errors.duplicateName')
    expect(
      fieldsProblem([fields[0]!, { ...fields[1]!, name: 'Progress' }]),
    ).toBeNull()
  })
})

describe('text made from a list', () => {
  const options = Array.from({ length: 50 }, (_, i) =>
    `${i}`.padStart(2, '0').padEnd(60, 'x'),
  )
  const tags: FieldDefinition = {
    id: 'g',
    name: 'Tags',
    type: 'multiselect',
    options,
  }
  const asText: FieldDefinition = { id: 'g', name: 'Tags', type: 'text' }

  it('is dropped when the joined text is past the account’s limit', () => {
    expect(options.join(', ').length).toBeGreaterThan(2000)
    expect(carryValue(options, tags, asText, {}, 500)).toBeUndefined()
    expect(carryValue(options, tags, asText, {}, 2000)).toBeUndefined()
    const items = [{ data: { g: options } as ItemData }]
    expect(valuesLost(items, [tags], [asText], {}, 500).get('g')).toBe(1)
    expect(migrateItemData({ g: options }, [tags], [asText], {}, 500)).toEqual(
      {},
    )
  })

  it('is kept when it fits: 2,000 on Pro but not 500 on Free', () => {
    const some = options.slice(0, 9)
    expect(carryValue(some, tags, asText, {}, 500)).toBeUndefined()
    expect(carryValue(some, tags, asText, {}, 2000)).toBe(some.join(', '))
  })

  it('keeps a long text value that stays text', () => {
    const long = 'x'.repeat(1800)
    const renamed: FieldDefinition = { ...text, name: 'Notes 2' }
    expect(carryValue(long, text, renamed, {}, 500)).toBe(long)
    expect(migrateItemData({ t: long }, [text], [renamed], {}, 500)).toBeNull()
  })
})
