import { randomBytes } from 'node:crypto'
import {
  AdminCreateUserCommand,
  AdminLinkProviderForUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import type { PreSignUpTriggerEvent } from 'aws-lambda'

/** The social logins set up in `sst.config.ts`, as Cognito names them. */
export const PROVIDERS = ['Google'] as const

const cognito = new CognitoIdentityProviderClient({})

/**
 * Cognito's pre-sign-up trigger. Keeps one account per email, however
 * someone signs in.
 *
 * The first time someone signs in with a social login, this links it to the
 * account with the same email: an email/password one, or one made earlier
 * for another social login. With no account yet, it makes a plain one (no
 * usable password; "Forgot password" can set one) and links to that. Every
 * sign-in then gets that account's `sub`, which is what Postgres keys on.
 *
 * Only an email the provider says is verified is linked, so nobody can
 * sign in to someone else's account with an address they don't own.
 *
 * Cognito then fails this one sign-in with "Already found an entry for
 * username", since the login is now linked rather than new. The sign-in
 * callback page starts it again, and the second time goes straight in.
 */
export async function handler(
  event: PreSignUpTriggerEvent,
): Promise<PreSignUpTriggerEvent> {
  if (event.triggerSource !== 'PreSignUp_ExternalProvider') return event

  const source = socialLogin(event.userName)
  const email = event.request.userAttributes.email?.trim().toLowerCase()
  if (!email) throw new Error('This sign-in has no email address.')
  if (event.request.userAttributes.email_verified !== 'true') {
    throw new Error('This sign-in has no verified email address.')
  }

  const userPoolId = event.userPoolId
  const found = await accountWithEmail(userPoolId, email)
  // An account left half made (an earlier run ran out of time before its
  // password was set) gets finished, so "Forgot password" works for it.
  if (found?.status === 'FORCE_CHANGE_PASSWORD') {
    await setUnguessablePassword(userPoolId, found.username)
  }
  const account = found?.username ?? (await createAccount(userPoolId, email))

  await cognito.send(
    new AdminLinkProviderForUserCommand({
      UserPoolId: userPoolId,
      DestinationUser: {
        ProviderName: 'Cognito',
        ProviderAttributeValue: account,
      },
      SourceUser: {
        ProviderName: source.provider,
        ProviderAttributeName: 'Cognito_Subject',
        ProviderAttributeValue: source.id,
      },
    }),
  )
  return event
}

/**
 * Which social login a federated username (`google_1234`) comes from, and
 * its id there. Cognito lowercases the provider in the username, so it's
 * matched against our providers to get the name linking needs.
 */
export function socialLogin(userName: string): {
  provider: (typeof PROVIDERS)[number]
  id: string
} {
  const split = userName.indexOf('_')
  const prefix = userName.slice(0, split).toLowerCase()
  const provider = PROVIDERS.find((name) => name.toLowerCase() === prefix)
  const id = userName.slice(split + 1)
  if (split <= 0 || !provider || !id) {
    throw new Error(`Unknown sign-in provider for ${prefix || 'a user'}.`)
  }
  return { provider, id }
}

/** The account (not a social login) with this email, if there is one. */
async function accountWithEmail(
  userPoolId: string,
  email: string,
): Promise<{ username: string; status: string } | null> {
  const { Users = [] } = await cognito.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email.replaceAll('"', '')}"`,
      Limit: 10,
    }),
  )
  const account = Users.find((user) => user.UserStatus !== 'EXTERNAL_PROVIDER')
  return account?.Username
    ? { username: account.Username, status: account.UserStatus ?? '' }
    : null
}

/**
 * Makes a confirmed account for an email, with a long random password
 * nobody knows. "Forgot password" can set a real one later.
 */
async function createAccount(
  userPoolId: string,
  email: string,
): Promise<string> {
  const { User } = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS',
    }),
  )
  const username = User?.Username
  if (!username) throw new Error('The account could not be created.')
  await setUnguessablePassword(userPoolId, username)
  return username
}

/** Confirms an account with a password nobody knows. */
async function setUnguessablePassword(userPoolId: string, username: string) {
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: unguessablePassword(),
      Permanent: true,
    }),
  )
}

/** Random, and meets the pool's rules (upper, lower and a number). */
export function unguessablePassword(): string {
  return `${randomBytes(24).toString('base64url')}Aa1`
}
