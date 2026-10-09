import { describe, expect, it } from 'vitest'
import { bearerToken } from './auth'

describe('bearerToken', () => {
  it('reads the token from a Bearer header', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(bearerToken('bearer abc')).toBe('abc')
  })

  it('returns null for missing or malformed headers', () => {
    expect(bearerToken(undefined)).toBeNull()
    expect(bearerToken('')).toBeNull()
    expect(bearerToken('Basic abc')).toBeNull()
    expect(bearerToken('Bearer')).toBeNull()
    expect(bearerToken('Bearer a b')).toBeNull()
  })
})
