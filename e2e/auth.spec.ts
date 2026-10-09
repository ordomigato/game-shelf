import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Answers Amplify's calls to Cognito with a Cognito-style error, so error
 * handling can be tested without a real user pool.
 */
async function cognitoRejects(page: Page, target: string, type: string) {
  await page.route('https://cognito-idp.*.amazonaws.com/**', (route) => {
    const action = route.request().headers()['x-amz-target'] ?? ''
    if (!action.endsWith(`.${target}`)) return route.abort()
    return route.fulfill({
      status: 400,
      contentType: 'application/x-amz-json-1.1',
      body: JSON.stringify({ __type: type, message: 'raw Cognito message' }),
    })
  })
}

test('signed-out visitors see Sign in in the header', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
})

test('account pages send signed-out visitors to sign in', async ({ page }) => {
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)account$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('a wrong password shows a plain message', async ({ page }) => {
  await cognitoRejects(page, 'InitiateAuth', 'NotAuthorizedException')
  await page.goto('/login')

  await page.getByLabel('Email').fill('someone@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Wrong1234')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    "That email and password don't match.",
  )
  await expect(page.getByText('raw Cognito message')).toBeHidden()
})

test('signing up with a used email suggests signing in', async ({ page }) => {
  await cognitoRejects(page, 'SignUp', 'UsernameExistsException')
  await page.goto('/signup')

  await expect(page.getByText('At least 8 characters')).toBeVisible()
  await page.getByLabel('Email').fill('taken@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Good1234')
  await page.getByLabel('Confirm password', { exact: true }).fill('Good1234')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'An account with that email already exists. Try signing in.',
  )
})

test('sign in and sign up link to each other and to password reset', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(
    page.getByRole('heading', { name: 'Create an account' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Sign in' }).last().click()
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(
    page.getByRole('heading', { name: 'Reset your password' }),
  ).toBeVisible()
})

test('the verify page explains where the code went', async ({ page }) => {
  await cognitoRejects(page, 'ConfirmSignUp', 'CodeMismatchException')
  await page.goto('/verify?email=new%40example.com')

  await expect(page.getByText('We sent a 6-digit code to')).toBeVisible()
  await expect(page.getByText('new@example.com')).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveCount(0)

  await page.getByRole('textbox', { name: '6-digit code' }).fill('123456')

  await expect(page.getByRole('alert')).toHaveText(
    "That code isn't right. Check the email and try again.",
  )
})

test('the header is drawn signed-in on the server when the cookie says so', async ({
  page,
  baseURL,
}) => {
  await page.context().addCookies([
    {
      name: 'gs_user',
      value: encodeURIComponent(JSON.stringify({ username: 'retro_fan' })),
      url: baseURL!,
    },
  ])
  const html = await (await page.request.get('/')).text()
  expect(html).toContain('retro_fan')
  expect(html).not.toContain('>Sign in<')
})

test('sign-up checks the password before asking Cognito', async ({ page }) => {
  let cognitoCalls = 0
  await page.route('https://cognito-idp.*.amazonaws.com/**', (route) => {
    cognitoCalls++
    return route.abort()
  })
  await page.goto('/signup')
  await page.getByLabel('Email').fill('new@example.com')
  const password = page.getByLabel('Password', { exact: true })
  const confirmation = page.getByLabel('Confirm password', { exact: true })
  const rules = page.getByRole('list', { name: 'Password rules' })

  await password.fill('abc')
  await confirmation.fill('abc')
  await expect(
    rules.getByRole('listitem').filter({ hasText: 'A lowercase letter' }),
  ).toContainText('(done)')
  await expect(
    rules.getByRole('listitem').filter({ hasText: 'A capital letter' }),
  ).toContainText('(not yet)')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'needs at least 8 characters',
  )

  await password.fill('Good1234')
  await confirmation.fill('Good1235')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('alert')).toHaveText("The passwords don't match.")
  expect(cognitoCalls).toBe(0)
})

test('the eye button shows and hides a password', async ({ page }) => {
  await page.goto('/login')
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('Secret123')
  await expect(password).toHaveAttribute('type', 'password')

  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')

  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(password).toHaveAttribute('type', 'password')
})
