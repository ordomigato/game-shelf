import type { Message } from '../types/message'

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20
/** Lowercase letters, numbers and underscores. Also enforced in Postgres. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

/** Lowercases and trims a username the way it will be stored. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * What someone typed into "Find an account", as a username to look up, or
 * null when it can't be one. Allows one leading `@`. Only exact usernames are
 * ever looked up, so the box can't be used to list accounts.
 */
export function usernameToFind(value: string): string | null {
  const name = normalizeUsername(value).replace(/^@/, '')
  return USERNAME_PATTERN.test(name) ? name : null
}

/** Why a (normalized) username can't be used, or null when it's fine. */
export function usernameProblem(username: string): Message | null {
  if (username.length < USERNAME_MIN_LENGTH) {
    return {
      key: 'username.problems.tooShort',
      params: { min: USERNAME_MIN_LENGTH },
    }
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return {
      key: 'username.problems.tooLong',
      params: { max: USERNAME_MAX_LENGTH },
    }
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { key: 'username.problems.characters' }
  }
  return null
}
