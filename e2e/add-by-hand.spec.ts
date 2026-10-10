import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const nes = {
  id: '10000000-0000-4000-8000-000000000009',
  title: 'NES Games',
  slug: 'nes-games',
  description: null,
  visibility: 'private',
  kind: 'custom',
  itemCount: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const homebrew = {
  id: '30000000-0000-4000-8000-000000000061',
  igdbId: null,
  name: 'Micro Mages',
  coverId: null,
  data: {},
}

/** Stubs adding by hand. Returns the bodies sent. */
async function stubAdd(page: Page) {
  const sent: unknown[] = []
  await page.route('**/api/library-items', (route) => {
    sent.push(route.request().postDataJSON())
    return route.fulfill({
      json: { item: homebrew, collectionIds: [nes.id] },
    })
  })
  return sent
}

test('adds a game by hand from the collection page', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: [nes] }),
  )
  let added = false
  await page.route('**/api/u/retro_fan/collections/nes-games', (route) =>
    route.fulfill({
      json: {
        ...nes,
        isOwner: true,
        itemCount: added ? 1 : 0,
        blueprint: {
          id: '20000000-0000-4000-8000-000000000009',
          name: null,
          shared: false,
          fields: [],
        },
        items: added
          ? [{ ...homebrew, addedAt: '2026-01-02T00:00:00.000Z' }]
          : [],
      },
    }),
  )
  const sent = await stubAdd(page)
  await page.goto('/u/retro_fan/shelf/nes-games')

  await page.getByRole('button', { name: 'Add by hand' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a game by hand' })
  const add = dialog.getByRole('button', { name: 'Add game' })
  await expect(add).toBeDisabled()
  added = true
  await dialog.getByRole('textbox', { name: 'Name' }).fill('  Micro Mages ')
  await add.click()

  await expect(dialog).toBeHidden()
  expect(sent).toEqual([
    {
      igdbId: null,
      name: 'Micro Mages',
      coverId: null,
      collectionIds: [nes.id],
    },
  ])
  // It shows up, and with no IGDB page its name isn't a link.
  const row = page.locator('table tbody tr').first()
  await expect(row).toContainText('Micro Mages')
  await expect(row.getByRole('link')).toHaveCount(0)
})

test('offers it when searching for a collection', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: [nes] }),
  )
  await page.route('**/api/games/search?**', (route) =>
    route.fulfill({ json: { games: [], page: 1, hasMore: false } }),
  )
  const sent = await stubAdd(page)
  await page.goto('/?to=nes-games')
  await expect(page.getByText('Adding to NES Games')).toBeVisible()
  await page
    .getByRole('searchbox', { name: 'Search games' })
    .fill('micro mages')

  await page.getByRole('button', { name: 'Add it by hand' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a game by hand' })
  // Starts with what was searched for.
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue(
    'micro mages',
  )
  await dialog.getByRole('button', { name: 'Add game' }).click()
  await expect(page.getByText('Added Micro Mages to NES Games')).toBeVisible()
  expect(sent).toHaveLength(1)
})

test('is not offered in plain search', async ({ page }) => {
  await page.route('**/api/games/search?**', (route) =>
    route.fulfill({ json: { games: [], page: 1, hasMore: false } }),
  )
  await page.goto('/')
  await page.getByRole('searchbox', { name: 'Search games' }).fill('zzz')
  await expect(
    page
      .getByRole('paragraph')
      .filter({ hasText: 'No games found for "zzz".' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Add it by hand' }),
  ).toHaveCount(0)
})
