import { expect, test } from './fixtures'

test('a refused request shows one plain toast', async ({ page }) => {
  await page.route('**/api/collections', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'Retry-After': '30' },
      json: { statusCode: 429, statusMessage: 'Too many requests' },
    }),
  )
  await page.goto('/')
  await page.waitForFunction(
    () => '__vue_app__' in (document.querySelector('#__nuxt') ?? {}),
  )
  // Two refused requests in a row still show one toast.
  await page.evaluate(async () => {
    await Promise.allSettled([
      $fetch('/api/collections'),
      $fetch('/api/collections'),
    ])
  })
  await expect(
    page.getByText('Too many requests. Wait a moment and try again.'),
  ).toHaveCount(1)
})
