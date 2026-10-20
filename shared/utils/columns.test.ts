import { describe, expect, it } from 'vitest'
import { allColumnsKnown, columnKeys, knownHiddenColumns } from './columns'

describe('columnKeys', () => {
  it('gives a collection only the Added column besides its fields', () => {
    expect([...columnKeys('collection', ['status'])]).toEqual([
      'addedAt',
      'status',
    ])
  })

  it('gives the lists their collections and platforms too', () => {
    expect(columnKeys('list', []).has('platforms')).toBe(true)
    expect(columnKeys('list', []).has('inCollections')).toBe(true)
    expect(columnKeys('collection', []).has('platforms')).toBe(false)
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
    expect(allColumnsKnown(['platforms'], 'collection', [])).toBe(false)
    expect(allColumnsKnown(['name'], 'list', [])).toBe(false)
    expect(allColumnsKnown(['nope'], 'list', ['status'])).toBe(false)
  })
})
