import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collectionId = '10000000-0000-4000-8000-000000000061'

const collectionOf = (itemCount: number) => ({
  id: collectionId,
  title: 'Final Fantasy',
  slug: 'final-fantasy',
  description: null,
  visibility: 'private',
  itemCount,
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const entry = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  igdbId: 1000 + i,
  name: `Game ${i}`,
  coverId: null,
  data: {},
  owned: true,
  wishlisted: false,
  ownedOn: [],
  wantedOn: [],
  addedAt: '2026-01-01T00:00:00.000Z',
  position: 'a',
  inCollections: [],
})

/** Opens the collection page for a collection holding `count` games. */
async function openCollection(page: Page, count: number) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: [collectionOf(count)] }),
  )
  await page.route('**/api/lists', (route) =>
    route.fulfill({ json: { owned: 0, wishlist: 0 } }),
  )
  await page.route('**/api/u/retro_fan/collections/final-fantasy', (route) =>
    route.fulfill({
      json: {
        ...collectionOf(count),
        isOwner: true,
        fields: [],
        items: Array.from({ length: Math.min(count, 5) }, (_, i) => entry(i)),
        dashboard: [],
      },
    }),
  )
  await page.goto('/u/retro_fan/shelf/final-fantasy')
}

test('a collection over the limit warns and stops adding', async ({ page }) => {
  await openCollection(page, 140)
  const alert = page.getByTestId('over-limit')
  await expect(alert).toContainText(
    'This collection has 140 games. Your plan allows 100 per collection.',
  )
  await expect(alert).toContainText(
    "You can keep and remove games, but you can't add more until it's down to 100.",
  )
  await expect(
    alert.getByRole('link', { name: 'Pro allows 1,000. See plans.' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add games' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add by hand' })).toBeDisabled()
})

test('a collection with room has no warning', async ({ page }) => {
  await openCollection(page, 40)
  await expect(page.getByRole('link', { name: 'Add games' })).toBeVisible()
  await expect(page.getByTestId('over-limit')).toHaveCount(0)
})

test('a full collection shows as Full in the Add to menu', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  const open = { ...collectionOf(40), title: 'Open Shelf', slug: 'open-shelf' }
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: [collectionOf(100), open] }),
  )
  await page.route('**/api/lists', (route) =>
    route.fulfill({ json: { owned: 0, wishlist: 0 } }),
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
  await page.goto('/')
  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
  await page.getByRole('button', { name: 'Add to collection: Zelda' }).click()
  const full = page.getByRole('menuitemcheckbox', { name: /Final Fantasy/ })
  await expect(full).toBeDisabled()
  await expect(full).toContainText('Full')
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Open Shelf' }),
  ).toBeEnabled()
})

test('importing more rows than the room left stops at the file', async ({
  page,
}) => {
  await openCollection(page, 90)
  await page.getByRole('button', { name: 'Collection actions' }).click()
  await page.getByRole('menuitem', { name: 'Import CSV' }).click()
  const rows = Array.from({ length: 340 }, (_, i) => `Game ${i}`).join('\n')
  await page.getByLabel('Choose a CSV file').setInputFiles({
    name: 'games.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`Name\n${rows}\n`),
  })
  await expect(
    page.getByText(
      'This collection has room for 10 more games. Your file has 340.',
    ),
  ).toBeVisible()
  await expect(page.getByLabel('Choose a CSV file')).toBeAttached()
  await expect(page.getByText('Choose where each column goes')).toHaveCount(0)
})

test('the Wishlist over its cap warns and stops adding', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/lists', (route) =>
    route.fulfill({ json: { owned: 0, wishlist: 230 } }),
  )
  await page.route('**/api/u/retro_fan/lists/wishlist', (route) =>
    route.fulfill({
      json: {
        list: 'wishlist',
        itemCount: 230,
        items: Array.from({ length: 3 }, (_, i) => entry(i)),
      },
    }),
  )
  await page.goto('/u/retro_fan/shelf/wishlist')
  const alert = page.getByTestId('over-limit')
  await expect(alert).toContainText(
    'Your Wishlist has 230 games. Your plan allows 200.',
  )
  await expect(
    alert.getByRole('link', { name: 'Pro allows 2,000. See plans.' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add games' })).toBeDisabled()
})

test('Pricing and Settings show the new numbers', async ({ page }) => {
  await page.goto('/pricing')
  const free = page.getByRole('region', { name: 'Free' })
  await expect(free.getByText('100 games per collection')).toBeVisible()
  await expect(free.getByText('200 games on the Wishlist')).toBeVisible()
  const pro = page.getByRole('region', { name: 'Pro' })
  await expect(pro.getByText('1,000 games per collection')).toBeVisible()
  await expect(pro.getByText('2,000 games on the Wishlist')).toBeVisible()
  await expect(pro.getByText('10,000 games in total')).toBeVisible()
})

test('Settings warns when the library is over the limit', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/me/usage', (route) =>
    route.fulfill({
      json: {
        plan: 'free',
        collections: 3,
        games: 3400,
        wishlist: 10,
        fields: 2,
      },
    }),
  )
  await page.goto('/account/usage')
  await expect(
    page.getByText('You have 3,400 games in total. Your plan allows 3,000.'),
  ).toBeVisible()
})
