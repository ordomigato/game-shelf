import { expect, test } from './fixtures'

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('GameShelf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Find any game',
  )
})

test('theme switcher changes and remembers the theme', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')

  await page.getByRole('button', { name: 'Change theme' }).click()
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(html).toHaveClass(/\bdark\b/)

  await page.reload()
  await expect(html).toHaveClass(/\bdark\b/)

  await page.getByRole('button', { name: 'Change theme' }).click()
  await page.getByRole('menuitemradio', { name: 'Light' }).click()
  await expect(html).toHaveClass(/\blight\b/)
  await expect(html).not.toHaveClass(/\bdark\b/)
})
