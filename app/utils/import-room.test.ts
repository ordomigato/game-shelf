import { describe, expect, it } from 'vitest'
import { newGamesIn } from './import-room'

describe('newGamesIn', () => {
  it('counts every unlinked row, even with the same title', () => {
    const rows = [{ igdbId: null }, { igdbId: null }]
    expect(newGamesIn(rows, new Set())).toEqual({ unlinked: 2, linkedIds: [] })
  })

  it('counts a linked game once and skips ones already in the collection', () => {
    const rows = [{ igdbId: 1 }, { igdbId: 1 }, { igdbId: 2 }, { igdbId: 3 }]
    expect(newGamesIn(rows, new Set([2]))).toEqual({
      unlinked: 0,
      linkedIds: [1, 3],
    })
  })
})
