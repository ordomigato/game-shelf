import { describe, expect, it } from 'vitest'
import type { FieldDefinition } from '../types/collection'
import {
  BLUEPRINT_NAME_MAX_LENGTH,
  copyFields,
  copyValues,
  blueprintNameProblem,
} from './blueprint-names'

describe('blueprintNameProblem', () => {
  it('accepts a normal name', () => {
    expect(blueprintNameProblem('Collector basics')).toBeNull()
  })

  it('needs a name that is more than spaces', () => {
    expect(blueprintNameProblem('')).toEqual({
      key: 'blueprints.errors.nameRequired',
    })
    expect(blueprintNameProblem('   ')).toEqual({
      key: 'blueprints.errors.nameRequired',
    })
  })

  it('caps the trimmed length', () => {
    const longest = 'a'.repeat(BLUEPRINT_NAME_MAX_LENGTH)
    expect(blueprintNameProblem(`  ${longest}  `)).toBeNull()
    expect(blueprintNameProblem(`${longest}a`)).toEqual({
      key: 'blueprints.errors.nameTooLong',
      params: { max: BLUEPRINT_NAME_MAX_LENGTH },
    })
  })
})

describe('copyFields', () => {
  const fields: FieldDefinition[] = [
    { id: 'status', name: 'Status', type: 'select', options: ['A', 'B'] },
    { id: 'price', name: 'Price', type: 'currency', currency: 'EUR' },
  ]
  let n = 0
  const newId = () => `new-${++n}`

  it('keeps every field but gives each a new id', () => {
    n = 0
    const { fields: copy, idMap } = copyFields(fields, newId)
    expect(copy).toEqual([
      { ...fields[0], id: 'new-1' },
      { ...fields[1], id: 'new-2' },
    ])
    expect(idMap).toEqual({ status: 'new-1', price: 'new-2' })
  })

  it('shares no arrays with the blueprint', () => {
    const { fields: copy } = copyFields(fields, newId)
    copy[0]!.options!.push('C')
    expect(fields[0]!.options).toEqual(['A', 'B'])
  })
})

describe('copyValues', () => {
  const idMap = { status: 'new-1', price: 'new-2' }

  it('copies values to the new ids and keeps the originals', () => {
    expect(copyValues({ status: 'A', other: 1 }, idMap)).toEqual({
      status: 'A',
      other: 1,
      'new-1': 'A',
    })
  })

  it('returns null when the game has none of the fields', () => {
    expect(copyValues({ other: 1 }, idMap)).toBeNull()
  })
})
