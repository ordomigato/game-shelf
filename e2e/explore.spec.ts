import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * The page renders on the server, out of reach of browser stubs, so get
 * there from the header like a person would, once the app has taken over
 * the page (Vue sets `__vue_app__` on its root then). A click before that
 * is a full page load, rendered on the server.
 */
async function openExplore(page: Page) {
  await page.goto('/')
  await page.waitForFunction(
    () => '__vue_app__' in (document.querySelector('#__nuxt') ?? {}),
  )
  await page.getByRole('link', { name: 'Explore' }).click()
  await expect(page).toHaveURL(/\/explore$/)
}

const card = (n: number) => ({
  id: `10000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
  title: `Collection ${n}`,
  slug: `collection-${n}`,
  kind: 'custom',
  description: n === 1 ? 'Every licensed cart.' : null,
  itemCount: n,
  activeAt: '2026-10-01T00:00:00.000Z',
  owner: { username: 'retro_fan', displayName: n === 1 ? 'Retro Fan' : null },
  preview: [{ name: 'Chrono Trigger', coverId: null }],
})

test('lists public collections and loads more', async ({ page }) => {
  const asked: string[] = []
  await page.route('**/api/explore**', (route) => {
    const p = new URL(route.request().url()).searchParams.get('page') ?? '1'
    asked.push(p)
    return route.fulfill({
      json:
        p === '1'
          ? { collections: [card(1), card(2)], hasMore: true }
          : { collections: [card(3)], hasMore: false },
    })
  })
  await openExplore(page)

  const first = page.getByRole('link', { name: /Collection 1/ })
  await expect(first).toContainText('by Retro Fan · 1 game')
  await expect(first).toContainText('Every licensed cart.')
  await expect(first).toHaveAttribute('href', '/u/retro_fan/shelf/collection-1')
  await expect(page.getByRole('link', { name: /Collection 2/ })).toContainText(
    'by retro_fan · 2 games',
  )

  await page.getByRole('button', { name: 'Show more' }).click()
  await expect(page.getByRole('link', { name: /Collection 3/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0)
  expect(asked).toEqual(['1', '2'])
})

test('says so when there is nothing to explore yet', async ({ page }) => {
  await page.route('**/api/explore**', (route) =>
    route.fulfill({ json: { collections: [], hasMore: false } }),
  )
  await openExplore(page)
  await expect(page.getByText('No public collections yet.')).toBeVisible()
})
