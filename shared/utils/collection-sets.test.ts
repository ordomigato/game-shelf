import { describe, expect, it } from 'vitest'
import { collectionChanges } from './collection-sets'

describe('collectionChanges', () => {
  it('finds the collections to join and to leave', () => {
    expect(collectionChanges(['a', 'b'], ['b', 'c'])).toEqual({
      add: ['c'],
      remove: ['a'],
    })
  })

  it('changes nothing when the sets match, whatever the order', () => {
    expect(collectionChanges(['a', 'b'], ['b', 'a'])).toEqual({
      add: [],
      remove: [],
    })
  })

  it('leaves every collection for an empty set', () => {
    expect(collectionChanges(['a', 'b'], [])).toEqual({
      add: [],
      remove: ['a', 'b'],
    })
  })

  it('counts a repeated id once', () => {
    expect(collectionChanges([], ['a', 'a'])).toEqual({
      add: ['a'],
      remove: [],
    })
  })
})
