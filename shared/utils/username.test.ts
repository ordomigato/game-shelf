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
    expect(usernameProblem('ab')).toEqual({
      key: 'username.problems.tooShort',
      params: { min: 3 },
    })
    expect(usernameProblem('a'.repeat(21))?.key).toBe(
      'username.problems.tooLong',
    )
  })

  it('rejects other characters', () => {
    for (const name of ['jeremy-g', 'jérémy', 'a b c']) {
      expect(usernameProblem(name)?.key).toBe('username.problems.characters')
    }
  })
})
