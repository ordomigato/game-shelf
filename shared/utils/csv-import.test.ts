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

  it('ignores Released and Genre, and reads Platforms', () => {
    const headers = ['Name', 'Released', 'Genre', 'Platforms', 'Condition']
    const rows = [['Zelda', '1991', 'Adventure', 'SNES', 'Loose']]
    expect(autoMap(headers, rows, fields)).toEqual([
      { kind: 'name' },
      { kind: 'skip' },
      { kind: 'skip' },
      { kind: 'platforms' },
      { kind: 'field', fieldId: 'cond' },
    ])
  })

  it("gives a file's only Genre or Platform column to the field of that name", () => {
    const own: FieldDefinition[] = [
      { id: 'g', name: 'Genre', type: 'text' },
      { id: 'p', name: 'Platform', type: 'text' },
    ]
    expect(
      autoMap(['Name', 'Genre', 'Platform'], [['Zelda', 'RPG', 'SNES']], own),
    ).toEqual([
      { kind: 'name' },
      { kind: 'field', fieldId: 'g' },
      { kind: 'field', fieldId: 'p' },
    ])
  })

  it('reads Wishlist platforms too', () => {
    expect(
      autoMap(
        ['Name', 'Platforms', 'Wishlist platforms'],
        [['Zelda', 'SNES', 'Switch']],
        [],
      ),
    ).toEqual([
      { kind: 'name' },
      { kind: 'platforms' },
      { kind: 'wishlistPlatforms' },
    ])
  })

  it('lets a later column of the same name be a field, as in our exports', () => {
    const genre: FieldDefinition = { id: 'g', name: 'Genre', type: 'text' }
    const headers = ['Name', 'Genre', 'Platforms', 'Genre', 'Platforms']
    const rows = [['Zelda', 'Adventure', 'SNES', 'Mine', 'Shelf 2']]
    const platform: FieldDefinition = {
      id: 'p',
      name: 'Platforms',
      type: 'text',
    }
    expect(autoMap(headers, rows, [genre, platform])).toEqual([
      { kind: 'name' },
      { kind: 'skip' },
      { kind: 'platforms' },
      { kind: 'field', fieldId: 'g' },
      { kind: 'field', fieldId: 'p' },
    ])
  })
})

describe('planImport platforms', () => {
  it('sends the platform names of each row, with its row in the file', () => {
    const plan = planImport(
      ['Name', 'Platforms'],
      [
        ['Zelda', 'SNES; Switch'],
        ['Homebrew', ''],
      ],
      [{ kind: 'name' }, { kind: 'platforms' }],
      [],
    )
    expect(plan.rows).toEqual([
      {
        name: 'Zelda',
        igdbId: null,
        values: {},
        platforms: ['SNES', 'Switch'],
        row: 2,
      },
      { name: 'Homebrew', igdbId: null, values: {} },
    ])
    expect(plan.problems).toEqual([])
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
