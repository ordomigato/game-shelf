import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const summary = {
  description: null,
  color: null,
  visibility: 'private',
  itemCount: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const owned = {
  ...summary,
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Owned',
  slug: 'owned',
  kind: 'owned',
}
const wishlist = {
  ...summary,
  id: '10000000-0000-4000-8000-000000000002',
  title: 'Wishlist',
  slug: 'wishlist',
  kind: 'wishlist',
}
const zelda = {
  id: '10000000-0000-4000-8000-000000000003',
  title: 'Zelda Games',
  slug: 'zelda-games',
  color: '#22c55e',
}
const snes = {
  id: '10000000-0000-4000-8000-000000000004',
  title: 'SNES',
  slug: 'snes',
  color: null,
}
const items = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    igdbId: 1026,
    name: 'A Link to the Past',
    coverId: null,
    year: 1991,
    genres: [],
    data: {},
    addedAt: '2026-05-02T10:00:00.000Z',
    inCollections: [snes, zelda],
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    igdbId: null,
    name: 'Homebrew Cart',
    coverId: null,
    year: null,
    genres: [],
    data: {},
    addedAt: '2026-05-01T10:00:00.000Z',
    inCollections: [],
  },
]

async function openOwned(page: Page) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) =>
    route.fulfill({
      json: [
        { ...owned, itemCount: 2 },
        wishlist,
        { ...summary, ...zelda, kind: 'custom', itemCount: 1 },
        { ...summary, ...snes, kind: 'custom', itemCount: 1 },
      ],
    }),
  )
  await page.route('**/api/u/retro_fan/collections/owned', (route) =>
    route.fulfill({
      json: {
        ...owned,
        itemCount: items.length,
        isOwner: true,
        blueprint: {
          id: '20000000-0000-4000-8000-000000000001',
          name: null,
          shared: false,
          fields: [],
        },
        dashboard: [],
        items,
      },
    }),
  )
  const removed: string[] = []
  await page.route('**/api/collections/*/items/*', (route) => {
    removed.push(
      `${route.request().method()} ${route.request().url().split('/api/')[1]}`,
    )
    return route.fulfill({ json: { collectionIds: [] } })
  })
  return removed
}

test('the sidebar links to the Owned list, with the collections each game is in', async ({
  page,
}) => {
  await openOwned(page)
  await page.goto('/blueprints')
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Owned games' })
    .click()
  await expect(page).toHaveURL('/u/retro_fan/shelf/owned')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Owned' }),
  ).toBeVisible()

  const table = page.getByRole('table')
  await expect(table.getByRole('columnheader')).toHaveText([
    'Order',
    /Name/,
    /Collections/,
    /Added/,
    'Actions',
  ])
  const rows = table.locator('tbody tr')
  await expect(
    rows.nth(0).getByRole('link', { name: 'Zelda Games' }),
  ).toHaveAttribute('href', '/u/retro_fan/shelf/zelda-games')
  await expect(rows.nth(0).getByRole('link', { name: 'SNES' })).toBeVisible()

  // Searching finds games by the collections they're in.
  await page
    .getByRole('searchbox', { name: 'Search this collection' })
    .fill('zelda')
  await expect(rows).toHaveCount(1)
  await page.getByRole('searchbox', { name: 'Search this collection' }).fill('')

  // Owned can't be deleted, and games don't move out of it. They can be
  // added to other collections.
  await page.getByRole('button', { name: 'Collection actions' }).click()
  await expect(
    page.getByRole('menuitem', { name: 'Delete collection' }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page
    .getByRole('button', { name: 'Actions for A Link to the Past' })
    .click()
  await expect(
    page.getByRole('menuitem', { name: 'Remove from collection' }),
  ).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: 'Add to', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: 'Move to', exact: true }),
  ).toHaveCount(0)
})

test('/owned opens the Owned list', async ({ page }) => {
  await openOwned(page)
  await page.goto('/owned')
  await expect(page).toHaveURL('/u/retro_fan/shelf/owned')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Owned' }),
  ).toBeVisible()
})

test('removing a game that is in collections asks first, and names them', async ({
  page,
}) => {
  const removed = await openOwned(page)
  await page.goto('/u/retro_fan/shelf/owned')
  const remove = async (name: string) => {
    await page.getByRole('button', { name: `Actions for ${name}` }).click()
    await page.getByRole('menuitem', { name: 'Remove from collection' }).click()
  }

  await remove('A Link to the Past')
  const dialog = page.getByRole('alertdialog')
  await expect(
    dialog.getByRole('heading', {
      name: 'Remove A Link to the Past from Owned?',
    }),
  ).toBeVisible()
  await expect(dialog).toContainText(
    'This also removes it from SNES and Zelda Games.',
  )
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  expect(removed).toEqual([])

  await remove('A Link to the Past')
  await dialog.getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect
    .poll(() => removed)
    .toEqual([`DELETE collections/${owned.id}/items/${items[0]!.id}`])

  // In no other collection: nothing to ask.
  await remove('Homebrew Cart')
  await expect(dialog).toBeHidden()
  await expect.poll(() => removed.length).toBe(2)
})
