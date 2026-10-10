import type { Message } from '../types/message'

/**
 * The password rules, matching the Cognito user pool's policy in
 * `sst.config.ts`. Cognito enforces them too. These give instant feedback.
 */
export const PASSWORD_MIN_LENGTH = 8

export interface PasswordRule extends Message {
  met: boolean
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    {
      key: 'password.rules.length',
      params: { min: PASSWORD_MIN_LENGTH },
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    { key: 'password.rules.uppercase', met: /[A-Z]/.test(password) },
    { key: 'password.rules.lowercase', met: /[a-z]/.test(password) },
    { key: 'password.rules.number', met: /\d/.test(password) },
  ]
}

/**
 * Why a new password can't be used yet, or null when it meets every rule
 * and matches its confirmation.
 */
export function newPasswordProblem(
  password: string,
  confirmation: string,
): Message | null {
  if (passwordRules(password).some((rule) => !rule.met)) {
    return {
      key: 'password.problems.rules',
      params: { min: PASSWORD_MIN_LENGTH },
    }
  }
  if (password !== confirmation) return { key: 'password.problems.mismatch' }
  return null
}
