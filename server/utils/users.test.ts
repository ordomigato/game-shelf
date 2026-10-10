import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from './users'

describe('isUniqueViolation', () => {
  it('spots Postgres error 23505, also when wrapped', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(
      isUniqueViolation(new Error('x', { cause: { code: '23505' } })),
    ).toBe(true)
  })

  it('ignores other errors', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation(new Error('boom'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })
})
