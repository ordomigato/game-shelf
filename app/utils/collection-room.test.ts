import { describe, expect, it } from 'vitest'
import { collectionFullFor } from './collection-room'

describe('collectionFullFor', () => {
  it('is full for a game that is not in it, at or over the limit', () => {
    expect(collectionFullFor({ itemCount: 100 }, 100, false)).toBe(true)
    expect(collectionFullFor({ itemCount: 140 }, 100, false)).toBe(true)
  })

  it('has room below the limit', () => {
    expect(collectionFullFor({ itemCount: 99 }, 100, false)).toBe(false)
  })

  it('never blocks a game that is already in it', () => {
    expect(collectionFullFor({ itemCount: 140 }, 100, true)).toBe(false)
  })
})
