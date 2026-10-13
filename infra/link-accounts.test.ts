import type { PreSignUpTriggerEvent } from 'aws-lambda'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent: { name: string; input: Record<string, unknown> }[] = []
/** What ListUsers finds for the email. */
let existing: { Username: string; UserStatus: string }[] = []

vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  const command = (name: string) =>
    class {
      constructor(public input: Record<string, unknown>) {
        Object.assign(this, { name })
      }
    }
  return {
    AdminCreateUserCommand: command('AdminCreateUser'),
    AdminLinkProviderForUserCommand: command('AdminLinkProviderForUser'),
    AdminSetUserPasswordCommand: command('AdminSetUserPassword'),
    ListUsersCommand: command('ListUsers'),
    CognitoIdentityProviderClient: class {
      async send(cmd: { name: string; input: Record<string, unknown> }) {
        sent.push({ name: cmd.name, input: cmd.input })
        if (cmd.name === 'ListUsers') return { Users: existing }
        if (cmd.name === 'AdminCreateUser') {
          return { User: { Username: 'new-account-id' } }
        }
        return {}
      }
    },
  }
})

const { handler, socialLogin, unguessablePassword } =
  await import('./link-accounts')

function signUp(
  overrides: {
    triggerSource?: string
    userName?: string
    email?: string
    verified?: string
  } = {},
): PreSignUpTriggerEvent {
  return {
    triggerSource: overrides.triggerSource ?? 'PreSignUp_ExternalProvider',
    userName: overrides.userName ?? 'google_1234567890',
    userPoolId: 'us-east-1_pool',
    request: {
      userAttributes: {
        email: overrides.email ?? 'Player@Example.com',
        email_verified: overrides.verified ?? 'true',
      },
    },
    response: {},
  } as unknown as PreSignUpTriggerEvent
}

const linkTo = (account: string) => ({
  name: 'AdminLinkProviderForUser',
  input: {
    UserPoolId: 'us-east-1_pool',
    DestinationUser: {
      ProviderName: 'Cognito',
      ProviderAttributeValue: account,
    },
    SourceUser: {
      ProviderName: 'Google',
      ProviderAttributeName: 'Cognito_Subject',
      ProviderAttributeValue: '1234567890',
    },
  },
})

describe('link accounts', () => {
  beforeEach(() => {
    sent.length = 0
    existing = []
  })

  it('leaves email and password sign-ups alone', async () => {
    const event = signUp({ triggerSource: 'PreSignUp_SignUp' })
    expect(await handler(event)).toBe(event)
    expect(sent).toEqual([])
  })

  it('links a social login to the account with the same email', async () => {
    existing = [
      { Username: 'google_999', UserStatus: 'EXTERNAL_PROVIDER' },
      { Username: 'existing-id', UserStatus: 'CONFIRMED' },
    ]
    await handler(signUp())
    expect(sent[0]).toMatchObject({
      name: 'ListUsers',
      input: { Filter: 'email = "player@example.com"' },
    })
    expect(sent.slice(1)).toEqual([linkTo('existing-id')])
  })

  it('makes an account first when there is none', async () => {
    await handler(signUp())
    expect(sent.map((call) => call.name)).toEqual([
      'ListUsers',
      'AdminCreateUser',
      'AdminSetUserPassword',
      'AdminLinkProviderForUser',
    ])
    expect(sent[1]!.input).toMatchObject({
      Username: 'player@example.com',
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: 'player@example.com' },
        { Name: 'email_verified', Value: 'true' },
      ],
    })
    expect(sent[2]!.input).toMatchObject({
      Username: 'new-account-id',
      Permanent: true,
    })
    expect(sent[3]).toEqual(linkTo('new-account-id'))
  })

  it('finishes an account an earlier run left half made', async () => {
    existing = [{ Username: 'half-made', UserStatus: 'FORCE_CHANGE_PASSWORD' }]
    await handler(signUp())
    expect(sent.map((call) => call.name)).toEqual([
      'ListUsers',
      'AdminSetUserPassword',
      'AdminLinkProviderForUser',
    ])
    expect(sent[1]!.input).toMatchObject({ Username: 'half-made' })
    expect(sent[2]).toEqual(linkTo('half-made'))
  })

  it('refuses an email the provider has not verified', async () => {
    await expect(handler(signUp({ verified: 'false' }))).rejects.toThrow(
      'no verified email',
    )
    expect(sent).toEqual([])
  })

  it('refuses a sign-in with no email', async () => {
    await expect(handler(signUp({ email: '' }))).rejects.toThrow('no email')
    expect(sent).toEqual([])
  })
})

describe('socialLogin', () => {
  it('reads the provider and id from a federated username', () => {
    expect(socialLogin('google_1234')).toEqual({
      provider: 'Google',
      id: '1234',
    })
    expect(socialLogin('Google_12_34')).toEqual({
      provider: 'Google',
      id: '12_34',
    })
  })

  it('rejects a provider that is not set up', () => {
    expect(() => socialLogin('myspace_1')).toThrow('Unknown sign-in provider')
    expect(() => socialLogin('nounderscore')).toThrow()
  })
})

describe('unguessablePassword', () => {
  it('meets the pool rules and differs each time', () => {
    const password = unguessablePassword()
    expect(password.length).toBeGreaterThanOrEqual(8)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[0-9]/)
    expect(unguessablePassword()).not.toBe(password)
  })
})
