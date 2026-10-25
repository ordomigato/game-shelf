import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const summary = (title: string) => ({
  id: crypto.randomUUID(),
  title,
  slug: title.toLowerCase().replaceAll(' ', '-'),
  description: null,
  visibility: 'private',
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
  await shelfWith(page, [summary('NES Games')])
  await expect(page.getByText('1 of 100 collections')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'New collection' }),
  ).toBeEnabled()
})

test('at the limit, New collection is off and the sidebar link explains', async ({
  page,
}) => {
  const full = Array.from({ length: 100 }, (_, i) => summary(`Collection ${i}`))
  await shelfWith(page, full)
  await expect(page.getByText('100 of 100 collections')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'New collection' }),
  ).toBeDisabled()

  await page.goto('/u/retro_fan/shelf?new=1')
  await expect(
    page.getByText(
      "You've reached 100 collections, the most your plan allows. Owned and the Wishlist don't count.",
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
    route.fulfill({
      json: {
        plan: 'free',
        collections: 3,
        games: 214,
        owned: 200,
        wishlist: 20,
      },
    }),
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
  await expect(
    page.getByText('Games: 214 of 3,000 (200 owned, 20 wishlisted)'),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'See plans and pricing' }),
  ).toHaveAttribute('href', '/pricing')
})

async function signInWithPlan(page: Page, plan: 'free' | 'pro') {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        id: '00000000-0000-4000-8000-000000000002',
        username: 'retro_fan',
        displayName: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        plan,
      },
    }),
  )
}

test('Pricing puts "Your plan" on Free for a Free user', async ({ page }) => {
  await signInWithPlan(page, 'free')
  await page.goto('/pricing')
  await expect(
    page.getByRole('region', { name: 'Free' }).getByText('Your plan'),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Pro' }).getByText('Your plan'),
  ).toHaveCount(0)
})

test('Pricing puts "Your plan" on Pro for a Pro user', async ({ page }) => {
  await signInWithPlan(page, 'pro')
  await page.goto('/pricing')
  await expect(
    page.getByRole('region', { name: 'Pro' }).getByText('Your plan'),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Free' }).getByText('Your plan'),
  ).toHaveCount(0)
})

test("Pricing lists Free from the real limits, and Pro as let's talk", async ({
  page,
}) => {
  await page.goto('/pricing')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Pricing' }),
  ).toBeVisible()
  const free = page.getByRole('region', { name: 'Free' })
  await expect(
    free.getByText('100 collections, plus Owned and the Wishlist'),
  ).toBeVisible()
  await expect(free.getByText('3,000 games, owned or wishlisted')).toBeVisible()
  const pro = page.getByRole('region', { name: 'Pro' })
  // Pro is worked out per person, so it lists no numbers.
  await expect(pro.getByRole('listitem')).toHaveCount(0)
  await expect(pro.getByText("Let's talk")).toBeVisible()
  await expect(
    pro.getByText("Send me an email and I'll sort out what you need."),
  ).toBeVisible()
  await expect(pro.getByRole('link', { name: 'Get in touch' })).toHaveAttribute(
    'href',
    '/contact',
  )
  await expect(page.getByRole('region', { name: 'Max' })).toHaveCount(0)
  await expect(page.getByText('Coming soon')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Why are there limits at all?' }),
  ).toBeVisible()
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Pricing' }),
  ).toHaveAttribute('href', '/pricing')
})
