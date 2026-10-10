import type { Page } from '@playwright/test'

/** Must match NUXT_PUBLIC_COGNITO_CLIENT_ID in playwright.config.ts. */
const CLIENT_ID = 'e2etestclient'

function fakeJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  return [
    encode({ alg: 'none', typ: 'JWT' }),
    encode({ iat: now, exp: now + 3600, ...claims }),
    'unsigned',
  ].join('.')
}

/**
 * Makes the browser look signed in to Amplify, with unsigned tokens in the
 * storage Amplify reads, and answers `/api/me` with the given user. Only
 * the browser is fooled: real server routes would reject these tokens, so
 * tests must stub every API call the page makes.
 */
export async function signInAs(
  page: Page,
  user: { username: string | null; displayName?: string | null },
) {
  const sub = '00000000-0000-4000-8000-000000000001'
  const cognitoUsername = sub
  const prefix = `CognitoIdentityServiceProvider.${CLIENT_ID}`
  const entries = {
    [`${prefix}.LastAuthUser`]: cognitoUsername,
    [`${prefix}.${cognitoUsername}.accessToken`]: fakeJwt({
      sub,
      username: cognitoUsername,
      token_use: 'access',
      client_id: CLIENT_ID,
    }),
    [`${prefix}.${cognitoUsername}.idToken`]: fakeJwt({
      sub,
      token_use: 'id',
      aud: CLIENT_ID,
      'cognito:username': cognitoUsername,
    }),
    [`${prefix}.${cognitoUsername}.refreshToken`]: 'fake-refresh-token',
    [`${prefix}.${cognitoUsername}.clockDrift`]: '0',
  }
  await page.addInitScript((items: Record<string, string>) => {
    for (const [key, value] of Object.entries(items)) {
      localStorage.setItem(key, value)
    }
  }, entries)
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        id: '00000000-0000-4000-8000-000000000002',
        username: user.username,
        displayName: user.displayName ?? null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    }),
  )
}
