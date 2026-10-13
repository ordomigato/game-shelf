/** Social logins set up in Cognito (names as Cognito knows them). */
export type SocialProvider = 'Google' | 'Twitch'

/**
 * A social sign-in on its way through Cognito's pages: where to go after,
 * and whether it has already been restarted once. Kept in session storage,
 * since the page is left and loaded again.
 */
export interface PendingSocialSignIn {
  provider: SocialProvider
  redirect: string
  retried: boolean
}

const KEY = 'gameshelf:social-sign-in'

export function savePendingSocialSignIn(pending: PendingSocialSignIn) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pending))
  } catch {
    // Without storage the sign-in still works; it just lands on home.
  }
}

export function takePendingSocialSignIn(): PendingSocialSignIn | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return raw ? (JSON.parse(raw) as PendingSocialSignIn) : null
  } catch {
    return null
  }
}

/**
 * What a failed social sign-in's `error_description` from Cognito means.
 * `retry`: starting again goes straight in. Either it's the first sign-in
 * after linking to an account, which Cognito always fails, or the linking
 * trigger ran past Cognito's 5 seconds (it finishes anyway, and can safely
 * run again).
 */
export function socialSignInProblem(
  description: string,
): 'retry' | 'unverifiedEmail' | 'other' {
  if (/already found an entry for username|timed out/i.test(description)) {
    return 'retry'
  }
  if (/no verified email|no email/i.test(description)) {
    return 'unverifiedEmail'
  }
  return 'other'
}
