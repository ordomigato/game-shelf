import { describe, expect, it } from 'vitest'
import { PLAN_LIMITS, limitsFor } from './plans'

describe('limitsFor', () => {
  it('gives each plan its limits, with Max starting from Pro', () => {
    expect(limitsFor('free')).toEqual(PLAN_LIMITS.free)
    expect(limitsFor('pro')).toEqual(PLAN_LIMITS.pro)
    expect(limitsFor('max')).toEqual(PLAN_LIMITS.pro)
  })

  it('applies custom limits on top, on any plan', () => {
    expect(limitsFor('max', { games: 8000 }).games).toBe(8000)
    expect(limitsFor('free', { collections: 12 }).collections).toBe(12)
    expect(limitsFor('free', { collections: 12 }).games).toBe(3000)
  })

  it('never goes past what the app supports', () => {
    const limits = limitsFor('max', {
      fields: 100,
      chartsPerCollection: 100,
      importRows: 50_000,
    })
    expect(limits.fields).toBe(30)
    expect(limits.chartsPerCollection).toBe(24)
    expect(limits.importRows).toBe(5000)
  })

  it('sizes games for one collection and the library', () => {
    const { free, pro } = PLAN_LIMITS
    expect([free.gamesPerCollection, pro.gamesPerCollection]).toEqual([
      100, 1000,
    ])
    expect([free.games, pro.games]).toEqual([3000, 10_000])
  })

  it('keeps hand-set game limits within the app maximums', () => {
    const limits = limitsFor('max', {
      gamesPerCollection: 20_000,
      games: 25_000,
    })
    expect(limits.gamesPerCollection).toBe(1000)
    expect(limits.games).toBe(10_000)
    expect(
      limitsFor('max', { gamesPerCollection: 400 }).gamesPerCollection,
    ).toBe(400)
  })

  it('ignores custom keys that are not limits', () => {
    const custom = { fieldsPerCollection: 90 } as unknown as { games: number }
    expect(limitsFor('free', custom)).toEqual(PLAN_LIMITS.free)
  })

  it('ignores a hand-set wishlist limit, which no longer exists', () => {
    const custom = { wishlist: 5 } as unknown as { games: number }
    expect(limitsFor('free', custom)).toEqual(PLAN_LIMITS.free)
    expect(limitsFor('max', custom)).not.toHaveProperty('wishlist')
  })

  it('ignores custom values that are not numbers', () => {
    const custom = { games: 'lots' } as unknown as { games: number }
    expect(limitsFor('free', custom).games).toBe(3000)
  })
})
