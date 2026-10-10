import { describe, expect, it } from 'vitest'
import { afterIdForIndex, moveAfter } from './ordering'

const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
const ids = (items: { id: string }[]) => items.map((item) => item.id).join('')

describe('afterIdForIndex', () => {
  it('follows the item that will sit before it', () => {
    expect(afterIdForIndex(list, 'a', 2)).toBe('c') // b c a d
    expect(afterIdForIndex(list, 'd', 1)).toBe('a') // a d b c
  })

  it('goes first at index 0 and clamps past the end', () => {
    expect(afterIdForIndex(list, 'c', 0)).toBeNull()
    expect(afterIdForIndex(list, 'a', 99)).toBe('d')
  })
})

describe('moveAfter', () => {
  it('moves an item after another, or to the front', () => {
    expect(ids(moveAfter(list, 'a', 'c'))).toBe('bcad')
    expect(ids(moveAfter(list, 'd', null))).toBe('dabc')
    expect(ids(moveAfter(list, 'b', 'd'))).toBe('acdb')
  })

  it('leaves the list alone for unknown items', () => {
    expect(moveAfter(list, 'x', null)).toBe(list)
    expect(moveAfter(list, 'a', 'x')).toBe(list)
  })

  it('agrees with afterIdForIndex', () => {
    for (let from = 0; from < list.length; from++) {
      for (let to = 0; to < list.length; to++) {
        const id = list[from]!.id
        const moved = moveAfter(list, id, afterIdForIndex(list, id, to))
        expect(moved.findIndex((item) => item.id === id)).toBe(to)
      }
    }
  })
})
