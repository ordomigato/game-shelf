import { describe, expect, it } from 'vitest'
import { PLAN_LIMITS, limitsFor } from './plans'

describe('limitsFor', () => {
  it('gives each plan its limits, with Max starting from Pro', () => {
    expect(limitsFor('free')).toEqual(PLAN_LIMITS.free)
    expect(limitsFor('pro')).toEqual(PLAN_LIMITS.pro)
    expect(limitsFor('max')).toEqual(PLAN_LIMITS.pro)
  })

  it('applies custom limits on top, on any plan', () => {
    expect(limitsFor('max', { games: 60_000 }).games).toBe(60_000)
    expect(limitsFor('free', { collections: 12 }).collections).toBe(12)
    expect(limitsFor('free', { collections: 12 }).games).toBe(3000)
  })

  it('never goes past what the app supports', () => {
    const limits = limitsFor('max', {
      fieldsPerCollection: 100,
      chartsPerCollection: 100,
      importRows: 50_000,
    })
    expect(limits.fieldsPerCollection).toBe(30)
    expect(limits.chartsPerCollection).toBe(24)
    expect(limits.importRows).toBe(5000)
  })

  it('ignores custom values that are not numbers', () => {
    const custom = { games: 'lots' } as unknown as { games: number }
    expect(limitsFor('free', custom).games).toBe(3000)
  })
})
