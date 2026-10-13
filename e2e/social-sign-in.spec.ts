import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const PENDING = 'gameshelf:social-sign-in'

/** Stands in for Cognito's sign-in pages (NUXT_PUBLIC_COGNITO_DOMAIN). */
async function fakeCognitoPages(page: import('@playwright/test').Page) {
  const visits: URL[] = []
  await page.route('https://auth.e2e.test/**', (route) => {
    visits.push(new URL(route.request().url()))
    return route.fulfill({ contentType: 'text/html', body: '<p>Cognito</p>' })
  })
  return visits
}

test('Continue with Google goes to Cognito with Google picked', async ({
  page,
}) => {
  const visits = await fakeCognitoPages(page)
  await page.goto('/login?redirect=/explore')
  await page.getByRole('button', { name: 'Continue with Google' }).click()

  await expect(page.getByText('Cognito')).toBeVisible()
  const authorize = visits.find((url) => url.pathname === '/oauth2/authorize')!
  expect(authorize.searchParams.get('identity_provider')).toBe('Google')
  expect(authorize.searchParams.get('response_type')).toBe('code')
  expect(authorize.searchParams.get('redirect_uri')).toMatch(
    /^http:\/\/localhost:\d+\/auth\/callback$/,
  )
  expect(authorize.searchParams.get('code_challenge')).toBeTruthy()
})

test('Continue with Twitch goes to Cognito with Twitch picked', async ({
  page,
}) => {
  const visits = await fakeCognitoPages(page)
  await page.goto('/login')
  await page.getByRole('button', { name: 'Continue with Twitch' }).click()

  await expect(page.getByText('Cognito')).toBeVisible()
  const authorize = visits.find((url) => url.pathname === '/oauth2/authorize')!
  expect(authorize.searchParams.get('identity_provider')).toBe('Twitch')
})

test('sign-up offers Google and Twitch too', async ({ page }) => {
  await page.goto('/signup')
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Continue with Twitch' }),
  ).toBeVisible()
})

test('the first sign-in after linking accounts starts again by itself', async ({
  page,
}) => {
  const visits = await fakeCognitoPages(page)
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1')
      sessionStorage.setItem(
        key,
        JSON.stringify({
          provider: 'Google',
          redirect: '/explore',
          retried: false,
        }),
      )
    }
  }, PENDING)
  await page.goto(
    '/auth/callback?error_description=Already+found+an+entry+for+username+google_123+&error=invalid_request',
  )
  await expect(page.getByText('Cognito')).toBeVisible()
  expect(visits.at(-1)?.searchParams.get('identity_provider')).toBe('Google')
})

test('only restarts once, then explains', async ({ page }) => {
  await page.addInitScript((key) => {
    sessionStorage.setItem(
      key,
      JSON.stringify({ provider: 'Google', redirect: '/', retried: true }),
    )
  }, PENDING)
  await page.goto(
    '/auth/callback?error_description=Already+found+an+entry+for+username+google_123+&error=invalid_request',
  )
  await expect(
    page.getByRole('heading', { name: "Couldn't sign you in" }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Back to sign in' }),
  ).toBeVisible()
})

test('explains a Google account with no verified email', async ({ page }) => {
  await page.goto(
    '/auth/callback?error_description=PreSignUp+failed+with+error+This+sign-in+has+no+verified+email+address.&error=invalid_request',
  )
  await expect(page.getByRole('alert')).toContainText(
    'no verified email address',
  )
})

test('Security tells a Google sign-in how to set a password', async ({
  page,
}) => {
  await signInAs(page, { username: 'retro_fan', via: 'Google' })
  await page.goto('/account/security')
  await expect(page.getByText('You signed in with Google.')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'set one with a code' }),
  ).toHaveAttribute('href', '/forgot-password')
})

test('Security has no such note for email and password', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.goto('/account/security')
  await expect(
    page.getByRole('button', { name: 'Change password' }),
  ).toBeVisible()
  await expect(page.getByText('You signed in with')).toBeHidden()
})
