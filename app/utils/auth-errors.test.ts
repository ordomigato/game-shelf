import { afterEach, describe, expect, it, vi } from 'vitest'
import { authErrorMessage, GENERIC_AUTH_ERROR } from './auth-errors'

afterEach(() => vi.restoreAllMocks())

describe('authErrorMessage', () => {
  it('maps known Cognito errors to plain sentences', () => {
    const error = Object.assign(new Error('Incorrect username or password.'), {
      name: 'NotAuthorizedException',
    })
    expect(authErrorMessage(error)).toBe("That email and password don't match.")
  })

  it('never shows the raw error for unknown cases', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = Object.assign(new Error('InternalErrorException: oops'), {
      name: 'InternalErrorException',
    })
    expect(authErrorMessage(error)).toBe(GENERIC_AUTH_ERROR)
    expect(authErrorMessage('weird')).toBe(GENERIC_AUTH_ERROR)
  })

  it('uses plain punctuation (no dashes or semicolons)', () => {
    for (const name of [
      'UsernameExistsException',
      'InvalidPasswordException',
      'LimitExceededException',
      'CodeMismatchException',
    ]) {
      expect(authErrorMessage({ name })).not.toMatch(/[—–;]/)
    }
  })
})
