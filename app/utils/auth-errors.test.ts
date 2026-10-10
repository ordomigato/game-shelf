import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '../../i18n/locales/en.json'
import { authErrorKey } from './auth-errors'

afterEach(() => vi.restoreAllMocks())

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      en,
    )
}

describe('authErrorKey', () => {
  it('maps known Cognito errors to their own key', () => {
    const error = Object.assign(new Error('Incorrect username or password.'), {
      name: 'NotAuthorizedException',
    })
    expect(authErrorKey(error)).toBe('authErrors.NotAuthorizedException')
  })

  it('falls back to the generic key for unknown errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(authErrorKey({ name: 'InternalErrorException' })).toBe(
      'authErrors.generic',
    )
    expect(authErrorKey('weird')).toBe('authErrors.generic')
  })

  it('has English text for every key it can return', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const names = Object.keys(en.authErrors).filter((n) => n !== 'generic')
    for (const name of [...names, 'Unknown']) {
      expect(typeof lookup(authErrorKey({ name }))).toBe('string')
    }
  })
})
