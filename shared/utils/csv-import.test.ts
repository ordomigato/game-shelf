import { describe, expect, it } from 'vitest'
import type { FieldDefinition, FieldType } from '../types/collection'
import { autoMap, guessType, parseCell, planImport } from './csv-import'

const field = (type: FieldType, extra: Partial<FieldDefinition> = {}) =>
  ({ id: 'f', name: 'Field', type, ...extra }) as FieldDefinition

describe('parseCell', () => {
  it('reads numbers the way people write them', () => {
    expect(parseCell(field('currency'), '$1,234.50')).toBe(1234.5)
    expect(parseCell(field('number'), ' 40 ')).toBe(40)
    expect(parseCell(field('number'), '-3.5')).toBe(-3.5)
    expect(parseCell(field('progress'), '75%')).toBe(75)
    expect(parseCell(field('number'), 'lots')).toBeUndefined()
  })

  it('reads scores, with or without "out of"', () => {
    expect(parseCell(field('rating'), '4')).toBe(4)
    expect(parseCell(field('rating'), '4/5')).toBe(4)
    expect(parseCell(field('rating', { scale: 10 }), '8/10')).toBe(8)
    expect(parseCell(field('rating'), '8/10')).toBeUndefined()
    expect(parseCell(field('rating'), '9')).toBeUndefined()
  })

  it('reads yes and no in their usual spellings', () => {
    for (const yes of ['Yes', 'y', 'TRUE', '1', 'x', '✓']) {
      expect(parseCell(field('checkbox'), yes)).toBe(true)
    }
    expect(parseCell(field('checkbox'), 'No')).toBe(false)
    expect(parseCell(field('checkbox'), 'maybe')).toBeUndefined()
  })

  it('reads ISO dates only, since 03/04/2020 is ambiguous', () => {
    expect(parseCell(field('date'), '2020-03-04')).toBe('2020-03-04')
    expect(parseCell(field('date'), '2020-03-04T10:00:00Z')).toBe('2020-03-04')
    expect(parseCell(field('date'), '03/04/2020')).toBeUndefined()
  })

  it('matches choices ignoring case, and splits multiple choices', () => {
    const status = field('select', { options: ['Backlog', 'Playing'] })
    expect(parseCell(status, 'playing')).toBe('Playing')
    expect(parseCell(status, 'Dropped')).toBeUndefined()
    const genres = field('multiselect', { options: ['RPG', 'Action'] })
    expect(parseCell(genres, 'action; rpg')).toEqual(['RPG', 'Action'])
    expect(parseCell(genres, 'RPG, Action')).toEqual(['RPG', 'Action'])
  })

  it('treats empty cells as nothing, and undoes the export formula guard', () => {
    expect(parseCell(field('text'), '   ')).toBeNull()
    expect(parseCell(field('text'), "'=1+1")).toBe('=1+1')
  })
})

describe('guessType', () => {
  it('guesses from the values', () => {
    expect(guessType(['Yes', 'No', '', 'yes'])).toEqual({ type: 'checkbox' })
    expect(guessType(['2020-01-01', '2021-05-06'])).toEqual({ type: 'date' })
    expect(guessType(['$10', '$5.50'])).toEqual({ type: 'currency' })
    expect(guessType(['10', '5.5', '1'])).toEqual({ type: 'number' })
    expect(guessType(['50%', '100%'])).toEqual({ type: 'progress' })
    expect(guessType(['1', '0', '1'])).toEqual({ type: 'number' })
  })

  it('makes a choice list of a few repeated values', () => {
    expect(guessType(['SNES', 'NES', 'SNES', 'snes', 'NES'])).toEqual({
      type: 'select',
      options: ['snes', 'NES'],
    })
    expect(guessType(['RPG; Action', 'RPG'])).toEqual({
      type: 'multiselect',
      options: ['RPG', 'Action'],
    })
  })

  it('falls back to text for free-form values', () => {
    expect(guessType(['Great', 'Fun with friends', 'Hard'])).toEqual({
      type: 'text',
    })
    expect(guessType(['', ''])).toEqual({ type: 'text' })
  })
})

describe('autoMap', () => {
  const fields: FieldDefinition[] = [
    { id: 'cond', name: 'Condition', type: 'text' },
  ]

  it('finds the name, the IGDB id and matching fields', () => {
    const headers = ['Title', 'IGDB ID', 'Added', 'condition', 'Price', '']
    const rows = [['Zelda', '1022', '2026-01-01', 'Loose', '$5', 'x']]
    expect(autoMap(headers, rows, fields)).toEqual([
      { kind: 'name' },
      { kind: 'igdbId' },
      { kind: 'skip' },
      { kind: 'field', fieldId: 'cond' },
      { kind: 'new', name: 'Price', type: 'currency' },
      { kind: 'skip' },
    ])
  })
})

describe('planImport', () => {
  const status: FieldDefinition = {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: ['Backlog'],
  }
  let n = 0
  const newId = () => `new${++n}`

  it('plans games, new fields and new choices', () => {
    n = 0
    const plan = planImport(
      ['Name', 'IGDB ID', 'Status', 'Platform'],
      [
        ['Zelda', '1022', 'backlog', 'NES'],
        ['Homebrew', '', 'Playing', 'NES'],
      ],
      [
        { kind: 'name' },
        { kind: 'igdbId' },
        { kind: 'field', fieldId: 'status' },
        { kind: 'new', name: 'Platform', type: 'select' },
      ],
      [status],
      newId,
    )
    expect(plan.newFields).toEqual([
      { id: 'new1', name: 'Platform', type: 'select', options: ['NES'] },
    ])
    expect(plan.addedOptions).toEqual({ status: ['Playing'] })
    expect(plan.fields[0]!.options).toEqual(['Backlog', 'Playing'])
    expect(plan.rows).toEqual([
      {
        name: 'Zelda',
        igdbId: 1022,
        values: { status: 'Backlog', new1: 'NES' },
      },
      {
        name: 'Homebrew',
        igdbId: null,
        values: { status: 'Playing', new1: 'NES' },
      },
    ])
    expect(plan.problems).toEqual([])
  })

  it('reports cells it cannot use, and leaves empty cells out', () => {
    const price: FieldDefinition = { id: 'p', name: 'Price', type: 'currency' }
    const plan = planImport(
      ['Name', 'IGDB ID', 'Price'],
      [
        ['Zelda', 'abc', 'cheap'],
        ['', '', '5'],
        ['Metroid', '', ''],
        ['', '', ''],
      ],
      [{ kind: 'name' }, { kind: 'igdbId' }, { kind: 'field', fieldId: 'p' }],
      [price],
    )
    expect(plan.rows).toEqual([
      { name: 'Zelda', igdbId: null, values: {} },
      { name: 'Metroid', igdbId: null, values: {} },
    ])
    expect(plan.problems).toEqual([
      { row: 2, column: 'IGDB ID', value: 'abc', reason: 'badIgdbId' },
      { row: 2, column: 'Price', value: 'cheap', reason: 'doesNotFit' },
      { row: 3, column: 'Name', value: '', reason: 'noName' },
    ])
  })
})
