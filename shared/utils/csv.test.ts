import { describe, expect, it } from 'vitest'
import type { FieldDefinition, FieldType } from '../types/collection'
import { collectionCsv, exportValue, safeText, toCsv } from './csv'

const field = (type: FieldType): FieldDefinition => ({
  id: 'f',
  name: 'Field',
  type,
})

describe('toCsv', () => {
  it('starts with a byte-order mark and ends rows with CRLF', () => {
    expect(
      toCsv([
        ['a', 'b'],
        ['1', '2'],
      ]),
    ).toBe('\uFEFFa,b\r\n1,2\r\n')
  })

  it('quotes cells with commas, quotes or line breaks', () => {
    expect(toCsv([['Zelda, The', 'say "hi"', 'two\nlines']])).toBe(
      '\uFEFF"Zelda, The","say ""hi""","two\nlines"\r\n',
    )
  })
})

describe('safeText', () => {
  it('stops spreadsheets running text as a formula', () => {
    expect(safeText('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`)
    expect(safeText('+1')).toBe("'+1")
    expect(safeText('-sale')).toBe("'-sale")
    expect(safeText('@me')).toBe("'@me")
  })

  it('leaves ordinary text alone', () => {
    expect(safeText('Chrono Trigger')).toBe('Chrono Trigger')
  })
})

describe('exportValue', () => {
  it('writes each type readably', () => {
    expect(exportValue(field('checkbox'), true)).toBe('Yes')
    expect(exportValue(field('checkbox'), false)).toBe('No')
    expect(exportValue(field('currency'), 40)).toBe('40.00')
    expect(exportValue(field('number'), -5)).toBe('-5')
    expect(exportValue(field('rating'), 4)).toBe('4')
    expect(exportValue(field('date'), '1995-03-11')).toBe('1995-03-11')
    expect(exportValue(field('multiselect'), ['RPG', 'Action'])).toBe(
      'RPG; Action',
    )
  })

  it('leaves missing values empty and guards text', () => {
    expect(exportValue(field('text'), undefined)).toBe('')
    expect(exportValue(field('text'), '=1+1')).toBe("'=1+1")
  })
})

describe('collectionCsv', () => {
  it('writes a header, then a row per game with its fields', () => {
    const fields: FieldDefinition[] = [
      { id: 'c', name: 'Condition', type: 'select', options: ['Loose'] },
      { id: 'p', name: 'Price', type: 'currency', currency: 'USD' },
    ]
    const csv = collectionCsv(
      fields,
      [
        {
          name: 'Zelda, The',
          igdbId: 1022,
          addedAt: '2026-01-15T10:00:00.000Z',
          data: { c: 'Loose', p: 40 },
        },
        {
          name: 'Homebrew',
          igdbId: null,
          addedAt: '2026-02-01T00:00:00.000Z',
          data: {},
        },
      ],
      ['Name', 'IGDB ID', 'Added'],
    )
    expect(csv).toBe(
      '\uFEFFName,IGDB ID,Added,Condition,Price\r\n' +
        '"Zelda, The",1022,2026-01-15,Loose,40.00\r\n' +
        'Homebrew,,2026-02-01,,\r\n',
    )
  })
})
