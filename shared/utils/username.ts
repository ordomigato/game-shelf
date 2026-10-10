export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20
/** Lowercase letters, numbers and underscores. Also enforced in Postgres. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

/** Lowercases and trims a username the way it will be stored. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Returns why a (normalized) username can't be used, as a sentence to show
 * the user, or null when it's fine.
 */
export function usernameProblem(username: string): string | null {
  if (username.length < USERNAME_MIN_LENGTH) {
    return `Usernames need at least ${USERNAME_MIN_LENGTH} characters.`
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Usernames can have at most ${USERNAME_MAX_LENGTH} characters.`
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use only letters, numbers and underscores.'
  }
  return null
}
