import {
  autoSignIn,
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from 'aws-amplify/auth'
import type { NitroFetchOptions, NitroFetchRequest } from 'nitropack'
import type { Me } from '#shared/types/user'

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

/**
 * A cookie saying the browser was signed in last time, and as whom. Only
 * used to draw the header without a flash while the real check runs. It is
 * never trusted for access: the server only trusts verified tokens.
 */
export interface SignedInHint {
  username: string | null
}

let loading: Promise<void> | undefined

/**
 * Sign-in state and actions. Amplify talks to Cognito from the browser and
 * keeps the tokens. `me` is the GameShelf user from `/api/me`. Everything
 * here runs in the browser only. During server rendering `status` stays
 * `loading`.
 */
export function useAuth() {
  const status = useState<AuthStatus>('auth-status', () => 'loading')
  const me = useState<Me | null>('auth-me', () => null)
  const hint = useCookie<SignedInHint | null>('gs_user', {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  })

  function setSignedIn(user: Me) {
    me.value = user
    status.value = 'signedIn'
    hint.value = { username: user.username }
  }

  function setSignedOut() {
    me.value = null
    status.value = 'signedOut'
    hint.value = null
  }

  async function accessToken(): Promise<string | null> {
    const session = await fetchAuthSession()
    return session.tokens?.accessToken.toString() ?? null
  }

  /** `$fetch` with the user's access token attached. */
  async function apiFetch<T>(
    url: string,
    options: NitroFetchOptions<NitroFetchRequest> = {},
  ): Promise<T> {
    const token = await accessToken()
    if (!token) {
      throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
    }
    return $fetch<T>(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    } as NitroFetchOptions<NitroFetchRequest>) as Promise<T>
  }

  /** Re-reads the session and the GameShelf user. */
  async function refresh() {
    try {
      if (!(await accessToken())) {
        setSignedOut()
        return
      }
      setSignedIn(await apiFetch<Me>('/api/me'))
    } catch (error) {
      console.error(error)
      setSignedOut()
    }
  }

  /** Resolves once the first `refresh` after page load has finished. */
  function ensureLoaded(): Promise<void> {
    if (import.meta.server) return Promise.resolve()
    loading ??= refresh()
    return loading
  }

  return {
    status,
    me,
    hint,
    apiFetch,
    refresh,
    ensureLoaded,

    async signUp(email: string, password: string) {
      await signUp({
        username: email,
        password,
        options: { userAttributes: { email }, autoSignIn: true },
      })
    },

    /** Confirms the email code. Returns true when the user is now signed in. */
    async confirmSignUp(email: string, code: string): Promise<boolean> {
      const { nextStep } = await confirmSignUp({
        username: email,
        confirmationCode: code,
      })
      if (nextStep.signUpStep !== 'COMPLETE_AUTO_SIGN_IN') return false
      await autoSignIn()
      await refresh()
      return true
    },

    async resendCode(email: string) {
      await resendSignUpCode({ username: email })
    },

    /** Returns `needsConfirmation` when the email isn't verified yet. */
    async signIn(
      email: string,
      password: string,
    ): Promise<'signedIn' | 'needsConfirmation'> {
      const { nextStep } = await signIn({ username: email, password })
      if (nextStep.signInStep === 'CONFIRM_SIGN_UP') return 'needsConfirmation'
      await refresh()
      return 'signedIn'
    },

    async signOut() {
      await signOut()
      setSignedOut()
    },

    async requestPasswordReset(email: string) {
      await resetPassword({ username: email })
    },

    async confirmPasswordReset(
      email: string,
      code: string,
      newPassword: string,
    ) {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      })
    },

    async changePassword(oldPassword: string, newPassword: string) {
      await updatePassword({ oldPassword, newPassword })
    },

    async updateProfile(changes: {
      username?: string
      displayName?: string | null
    }) {
      setSignedIn(
        await apiFetch<Me>('/api/me', { method: 'PATCH', body: changes }),
      )
    },

    async deleteAccount() {
      await apiFetch('/api/me', { method: 'DELETE' })
      await signOut().catch(() => {})
      setSignedOut()
    },
  }
}
