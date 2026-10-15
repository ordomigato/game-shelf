import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const summary = (title: string, kind = 'custom') => ({
  id: crypto.randomUUID(),
  title,
  slug: title.toLowerCase().replaceAll(' ', '-'),
  description: null,
  visibility: 'private',
  kind,
  itemCount: 0,
  updatedAt: '2026-05-01T00:00:00.000Z',
})

async function shelfWith(page: Page, collections: unknown[]) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: collections }),
  )
  await page.route('**/api/u/retro_fan/collections', (route) =>
    route.fulfill({ json: collections }),
  )
  await page.route('**/api/u/retro_fan', (route) =>
    route.fulfill({
      json: {
        username: 'retro_fan',
        displayName: null,
        memberSince: '2026-01-01T00:00:00.000Z',
      },
    }),
  )
  await page.goto('/u/retro_fan/shelf')
}

test('the shelf shows collections used out of the plan', async ({ page }) => {
  await shelfWith(page, [
    summary('Owned', 'owned'),
    summary('Wishlist', 'wishlist'),
    summary('NES Games'),
  ])
  await expect(page.getByText('1 of 10 collections')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'New collection' }),
  ).toBeEnabled()
})

test('at the limit, New collection is off and the sidebar link explains', async ({
  page,
}) => {
  const ten = Array.from({ length: 10 }, (_, i) => summary(`Collection ${i}`))
  await shelfWith(page, [
    summary('Owned', 'owned'),
    summary('Wishlist', 'wishlist'),
    ...ten,
  ])
  await expect(page.getByText('10 of 10 collections')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'New collection' }),
  ).toBeDisabled()

  await page.goto('/u/retro_fan/shelf?new=1')
  await expect(
    page.getByText(
      "You've reached 10 collections, the most your plan allows. Owned and the Wishlist don't count.",
    ),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a refusal from the server says which limit', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: [summary('NES Games')] }),
  )
  await page.route('**/api/library-items/igdb/**', (route) =>
    route.fulfill({ json: { item: null, collectionIds: [] } }),
  )
  await page.route('**/api/library-items/igdb?**', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/games/search?**', (route) =>
    route.fulfill({
      json: {
        games: [
          { id: 1, name: 'Zelda', coverId: null, year: 1986, platforms: [] },
        ],
        page: 1,
        hasMore: false,
      },
    }),
  )
  await page.route('**/api/library-items', (route) =>
    route.fulfill({
      status: 403,
      json: {
        statusCode: 403,
        data: {
          key: 'limits.reached.gamesPerCollection',
          params: { limit: 1000 },
        },
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
  await page.getByRole('button', { name: 'Add to collection: Zelda' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'NES Games' }).click()
  await expect(
    page.getByText('A collection can hold up to 1000 games on your plan.'),
  ).toBeVisible()
})

test('the Usage tab shows the plan and what is used', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/me/usage', (route) =>
    route.fulfill({ json: { plan: 'free', collections: 3, games: 214 } }),
  )
  await page.goto('/account/usage')
  await expect(
    page
      .getByRole('navigation', { name: 'Account sections' })
      .getByRole('link', {
        name: 'Usage',
      }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Free plan' })).toBeVisible()
  await expect(
    page.getByRole('progressbar', { name: 'Collections' }),
  ).toHaveAttribute('aria-valuenow', '3')
  await expect(page.getByText('214 of 3,000')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'See plans and pricing' }),
  ).toHaveAttribute('href', '/pricing')
})

test('Pricing lists both plans from the real limits', async ({ page }) => {
  await page.goto('/pricing')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Pricing' }),
  ).toBeVisible()
  const free = page.getByRole('region', { name: 'Free' })
  await expect(
    free.getByText('10 collections, plus Owned and the Wishlist'),
  ).toBeVisible()
  await expect(free.getByText('3,000 games in total')).toBeVisible()
  const pro = page.getByRole('region', { name: 'Pro' })
  await expect(
    pro.getByText('100 collections, plus Owned and the Wishlist'),
  ).toBeVisible()
  await expect(pro.getByRole('button', { name: 'Coming soon' })).toBeDisabled()
  const max = page.getByRole('region', { name: 'Max' })
  await expect(max.getByText("Let's talk")).toBeVisible()
  await expect(max.getByRole('listitem')).toHaveCount(0)
  await expect(max.getByRole('link', { name: 'Get in touch' })).toHaveAttribute(
    'href',
    '/contact',
  )
  await expect(
    page.getByRole('heading', { name: 'Why a paid plan?' }),
  ).toBeVisible()
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Pricing' }),
  ).toHaveAttribute('href', '/pricing')
})
