import { describe, expect, it } from 'vitest'
import { newPasswordProblem, passwordRules } from './password'

describe('passwordRules', () => {
  it('ticks each rule independently', () => {
    expect(passwordRules('abc').map((r) => r.met)).toEqual([
      false,
      false,
      true,
      false,
    ])
    expect(passwordRules('Abcdefg1').every((r) => r.met)).toBe(true)
  })
})

describe('newPasswordProblem', () => {
  it('accepts a valid password that matches', () => {
    expect(newPasswordProblem('Abcdefg1', 'Abcdefg1')).toBeNull()
  })

  it('reports missing rules before a mismatch', () => {
    expect(newPasswordProblem('short', 'other')).toMatch(/at least 8/)
    expect(newPasswordProblem('abcdefg1', 'abcdefg1')).toMatch(/capital/)
  })

  it('reports a mismatch', () => {
    expect(newPasswordProblem('Abcdefg1', 'Abcdefg2')).toBe(
      "The passwords don't match.",
    )
  })
})
