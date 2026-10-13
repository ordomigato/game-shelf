import { describe, expect, it } from 'vitest'
import { socialSignInProblem } from './social-sign-in'

describe('socialSignInProblem', () => {
  it('restarts the first sign-in after linking accounts', () => {
    expect(
      socialSignInProblem('Already found an entry for username google_1234 '),
    ).toBe('retry')
  })

  it('restarts when the linking trigger took too long', () => {
    expect(socialSignInProblem('PreSignUp invocation timed out.')).toBe('retry')
  })

  it('spots an email the provider has not verified', () => {
    expect(
      socialSignInProblem(
        'PreSignUp failed with error This sign-in has no verified email address.',
      ),
    ).toBe('unverifiedEmail')
  })

  it('treats anything else as a plain failure', () => {
    expect(socialSignInProblem('access_denied')).toBe('other')
  })
})
