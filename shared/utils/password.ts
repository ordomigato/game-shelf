/**
 * The password rules, matching the Cognito user pool's policy in
 * `sst.config.ts`. Cognito enforces them too. These give instant feedback.
 */
export const PASSWORD_MIN_LENGTH = 8

export interface PasswordRule {
  label: string
  met: boolean
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    {
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    { label: 'A capital letter', met: /[A-Z]/.test(password) },
    { label: 'A lowercase letter', met: /[a-z]/.test(password) },
    { label: 'A number', met: /\d/.test(password) },
  ]
}

/**
 * Why a new password can't be used yet, as a sentence to show, or null when
 * it meets every rule and matches its confirmation.
 */
export function newPasswordProblem(
  password: string,
  confirmation: string,
): string | null {
  if (passwordRules(password).some((rule) => !rule.met)) {
    return 'Your password needs at least 8 characters, with a capital letter, a lowercase letter and a number.'
  }
  if (password !== confirmation) return "The passwords don't match."
  return null
}
