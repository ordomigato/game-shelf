import en from '../../i18n/locales/en.json'

/**
 * The i18n key for an Amplify or Cognito error: `authErrors.<name>` when the
 * English messages have one, otherwise `authErrors.generic` (and the
 * original goes to the console). To handle a new error, add its message to
 * `authErrors` in `i18n/locales/en.json`.
 */
export function authErrorKey(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name
  if (typeof name === 'string' && name !== 'generic' && name in en.authErrors) {
    return `authErrors.${name}`
  }
  console.error(error)
  return 'authErrors.generic'
}
