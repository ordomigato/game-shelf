import { describe, expect, it } from 'vitest'
import { allColumnsKnown, columnKeys, knownHiddenColumns } from './columns'

describe('columnKeys', () => {
  it('gives a collection the core columns and Added besides its fields', () => {
    expect([...columnKeys('collection', ['status'])]).toEqual([
      'released',
      'genre',
      'platforms',
      'addedAt',
      'status',
    ])
  })

  it('gives the lists the same core columns, and their collections', () => {
    for (const key of ['released', 'genre', 'platforms']) {
      expect(columnKeys('list', []).has(key)).toBe(true)
      expect(columnKeys('collection', []).has(key)).toBe(true)
    }
    expect(columnKeys('list', []).has('inCollections')).toBe(true)
    expect(columnKeys('collection', []).has('inCollections')).toBe(false)
  })

  it('never lets the name be hidden', () => {
    expect(columnKeys('list', []).has('name')).toBe(false)
  })
})

describe('knownHiddenColumns', () => {
  it('drops deleted fields and repeats', () => {
    expect(
      knownHiddenColumns(['gone', 'status', 'status', 'addedAt'], 'list', [
        'status',
      ]),
    ).toEqual(['status', 'addedAt'])
  })

  it('reads nothing saved as nothing hidden', () => {
    expect(knownHiddenColumns(undefined, 'list', [])).toEqual([])
  })
})

describe('allColumnsKnown', () => {
  it('accepts built-in keys and field ids', () => {
    expect(
      allColumnsKnown(['addedAt', 'status'], 'collection', ['status']),
    ).toBe(true)
  })

  it('rejects a key the table does not have', () => {
    expect(allColumnsKnown(['inCollections'], 'collection', [])).toBe(false)
    expect(allColumnsKnown(['name'], 'list', [])).toBe(false)
    expect(allColumnsKnown(['nope'], 'list', ['status'])).toBe(false)
  })
})
