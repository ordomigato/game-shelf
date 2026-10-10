import { describe, expect, it } from 'vitest'
import { normalizeUsername, usernameProblem } from './username'

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Jeremy_G ')).toBe('jeremy_g')
  })
})

describe('usernameProblem', () => {
  it('accepts letters, numbers and underscores', () => {
    expect(usernameProblem('retro_fan_99')).toBeNull()
  })

  it('rejects names that are too short or too long', () => {
    expect(usernameProblem('ab')).toMatch(/at least 3/)
    expect(usernameProblem('a'.repeat(21))).toMatch(/at most 20/)
  })

  it('rejects other characters', () => {
    expect(usernameProblem('jeremy-g')).toMatch(/letters, numbers/)
    expect(usernameProblem('jérémy')).toMatch(/letters, numbers/)
    expect(usernameProblem('a b c')).toMatch(/letters, numbers/)
  })
})
