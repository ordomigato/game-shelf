import { describe, expect, it } from 'vitest'
import { PLAN_LIMITS, limitsFor, normalizePlan } from './plans'

describe('normalizePlan', () => {
  it('counts a stored max as pro', () => {
    expect(normalizePlan('max')).toBe('pro')
    expect(normalizePlan('pro')).toBe('pro')
    expect(normalizePlan('free')).toBe('free')
  })

  it('falls back to free for anything else', () => {
    expect(normalizePlan(null)).toBe('free')
    expect(normalizePlan(undefined)).toBe('free')
    expect(normalizePlan('gold')).toBe('free')
  })
})

describe('limitsFor', () => {
  it('gives each plan its limits, and a stored max gets Pro’s', () => {
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

  it('sizes the text limit per plan and lets custom limits raise it', () => {
    expect(limitsFor('free').textLength).toBe(500)
    expect(limitsFor('pro').textLength).toBe(2000)
    expect(limitsFor('free', { textLength: 800 }).textLength).toBe(800)
    expect(limitsFor('pro', { textLength: 1200 }).textLength).toBe(1200)
  })

  it('keeps a hand-set text limit within the app maximum', () => {
    expect(limitsFor('pro', { textLength: 50_000 }).textLength).toBe(2000)
  })

  it('ignores custom values that are not numbers', () => {
    const custom = { games: 'lots' } as unknown as { games: number }
    expect(limitsFor('free', custom).games).toBe(3000)
  })
})
