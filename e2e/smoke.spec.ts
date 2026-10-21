import { expect, test } from './fixtures'
import { signInAs } from './support/session'

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(
    'Track and share your game collection · ThisPlayShelf',
  )
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Find any game',
  )
})

test('theme switcher changes and remembers the theme', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await page.goto('/account/settings')
  const html = page.locator('html')

  const theme = page.getByRole('main').getByRole('group', { name: 'Theme' })
  await theme.getByRole('button', { name: 'Dark' }).click()
  await expect(html).toHaveClass(/\bdark\b/)

  await page.reload()
  await expect(html).toHaveClass(/\bdark\b/)

  await expect(theme.getByRole('button', { name: 'Dark' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await theme.getByRole('button', { name: 'Light' }).click()
  await expect(html).toHaveClass(/\blight\b/)
  await expect(html).not.toHaveClass(/\bdark\b/)
})
