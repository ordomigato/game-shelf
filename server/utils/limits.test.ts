import { describe, expect, it, vi } from 'vitest'
import { LIMIT_REACHED, PLAN_LIMITS, limitsFor } from '../../shared/utils/plans'
import { assertFieldRoom } from './limits'

// Nitro auto-imports this in the server.
vi.stubGlobal('LIMIT_REACHED', LIMIT_REACHED)

const fields = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => ({ id: `f${from + i}` }))
const free = limitsFor('free')

describe('assertFieldRoom', () => {
  it('allows fields up to the plan’s limit', () => {
    expect(() => assertFieldRoom(fields(3), fields(5), free)).not.toThrow()
    expect(PLAN_LIMITS.free.fields).toBe(5)
  })

  it('refuses a new field past the limit, with the limit in the message', () => {
    expect(() => assertFieldRoom(fields(5), fields(6), free)).toThrow(
      expect.objectContaining({
        statusCode: 403,
        data: { key: 'limits.reached.fields', params: { limit: 5 } },
      }),
    )
  })

  it('lets an account over the limit keep, edit and remove its fields', () => {
    const over = fields(8)
    expect(() => assertFieldRoom(over, over, free)).not.toThrow()
    expect(() => assertFieldRoom(over, over.slice(2), free)).not.toThrow()
  })

  it('refuses adding to an account already over the limit', () => {
    expect(() => assertFieldRoom(fields(8), fields(9, 0), free)).toThrow(
      expect.objectContaining({ statusCode: 403 }),
    )
  })

  it('counts a replaced field as an addition only when over the limit', () => {
    expect(() =>
      assertFieldRoom(fields(5), [...fields(4), { id: 'new' }], free),
    ).not.toThrow()
  })
})
