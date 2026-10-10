import { describe, expect, it } from 'vitest'
import { MIN_POSITION_GAP, positionBetween } from './positions'

describe('positionBetween', () => {
  it('goes halfway between two neighbours', () => {
    expect(positionBetween(3, 4)).toBe(3.5)
  })

  it('steps past the ends of the list', () => {
    expect(positionBetween(null, 1)).toBe(0)
    expect(positionBetween(7, null)).toBe(8)
    expect(positionBetween(null, null)).toBe(1)
  })

  it('asks for a renumber when neighbours are too close', () => {
    expect(positionBetween(1, 1 + MIN_POSITION_GAP)).toBeNull()
    expect(positionBetween(2, 2)).toBeNull()
  })

  it('allows many moves into the same spot before that', () => {
    let after = 2
    let moves = 0
    for (;;) {
      const next = positionBetween(1, after)
      if (next === null) break
      after = next
      moves++
    }
    expect(moves).toBeGreaterThanOrEqual(15)
  })
})
