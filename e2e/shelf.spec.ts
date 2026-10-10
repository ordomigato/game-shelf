import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const wishlist = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Wishlist',
  slug: 'wishlist',
  description: null,
  visibility: 'private',
  kind: 'wishlist',
  itemCount: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const zelda = {
  id: '10000000-0000-4000-8000-000000000002',
  title: 'Zelda Games',
  slug: 'zelda-games',
  description: 'Every Zelda I own.',
  visibility: 'public',
  kind: 'custom',
  itemCount: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const zeldaDetail = (isOwner: boolean) => ({
  ...zelda,
  isOwner,
  blueprint: {
    id: '20000000-0000-4000-8000-000000000001',
    name: null,
    shared: false,
    fields: [
      { id: 'f1', name: 'Condition', type: 'select', options: ['Loose'] },
      { id: 'f2', name: 'Price paid', type: 'currency' },
    ],
  },
  items: [
    {
      id: '30000000-0000-4000-8000-000000000001',
      igdbId: 1026,
      name: 'A Link to the Past',
      coverId: null,
      data: {},
      addedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
})

async function stubShelf(page: Page, owner: boolean) {
  await page.route('**/api/u/retro_fan/collections', (route) =>
    route.fulfill({ json: owner ? [wishlist, zelda] : [zelda] }),
  )
  await page.route('**/api/u/retro_fan/collections/zelda-games', (route) =>
    route.fulfill({ json: zeldaDetail(owner) }),
  )
  await page.route('**/api/u/retro_fan/collections/secret', (route) =>
    route.fulfill({ status: 404, json: { statusMessage: 'Not found' } }),
  )
}

test.describe('as a visitor', () => {
  test('sees only public collections, read-only', async ({ page }) => {
    await stubShelf(page, false)
    await page.goto('/u/retro_fan/shelf')

    await expect(
      page.getByRole('heading', { level: 1, name: "retro_fan's shelf" }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /Zelda Games/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Wishlist/ })).toBeHidden()
    await expect(
      page.getByRole('button', { name: 'New collection' }),
    ).toBeHidden()

    await page.getByRole('link', { name: /Zelda Games/ }).click()
    await expect(page.getByText('Every Zelda I own.')).toBeVisible()
    await expect(page.getByText('Columns: Condition, Price paid')).toBeVisible()
    await expect(
      page.getByRole('link', { name: /A Link to the Past/ }),
    ).toHaveAttribute('href', '/games/1026')
    await expect(
      page.getByRole('button', { name: 'Collection actions' }),
    ).toBeHidden()
    await expect(page.getByText('Private')).toBeHidden()
  })

  test('gets "not found" for a private or missing collection', async ({
    page,
  }) => {
    await stubShelf(page, false)
    await page.goto('/u/retro_fan/shelf/secret')
    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible()
  })
})

test.describe('as the owner', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, { username: 'retro_fan' })
    await stubShelf(page, true)
  })

  test('sees every collection with its visibility, and the header link', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'My shelf' }).click()

    await expect(
      page.getByRole('heading', { level: 1, name: 'My shelf' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /Wishlist/ })).toContainText(
      'Private',
    )
    await expect(page.getByRole('link', { name: /Zelda Games/ })).toContainText(
      'Public',
    )
  })

  test('creates a collection from a starter and lands on it', async ({
    page,
  }) => {
    let created: unknown
    await page.route('**/api/collections', async (route) => {
      // The new collection's page also lists the owner's collections.
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: [wishlist, zelda] })
      }
      created = route.request().postDataJSON()
      await route.fulfill({
        status: 201,
        json: {
          ...zelda,
          id: 'new',
          title: 'N64 Games',
          slug: 'n64-games',
          itemCount: 0,
        },
      })
    })
    await page.route('**/api/u/retro_fan/collections/n64-games', (route) =>
      route.fulfill({
        json: {
          ...zeldaDetail(true),
          title: 'N64 Games',
          slug: 'n64-games',
          items: [],
          itemCount: 0,
        },
      }),
    )
    await page.goto('/u/retro_fan/shelf')
    await page.getByRole('button', { name: 'New collection' }).click()
    const create = page.getByRole('button', { name: 'Create collection' })
    await expect(create).toBeDisabled()
    await page.getByLabel('Name').fill('   ')
    await expect(create).toBeDisabled()
    await page.getByLabel('Name').fill('N64 Games')
    await expect(page.getByText('/u/retro_fan/shelf/n64-games')).toBeVisible()
    await page.getByLabel('Player').check()
    await page.getByRole('button', { name: 'Create collection' }).click()

    await expect(page).toHaveURL(/\/u\/retro_fan\/shelf\/n64-games$/)
    await expect(page.getByText('No games here yet.')).toBeVisible()
    expect(created).toEqual({
      title: 'N64 Games',
      description: null,
      starter: 'player',
    })
  })

  test('shows a plain message for a name already in use', async ({ page }) => {
    await page.route('**/api/collections', (route) =>
      route.fulfill({
        status: 409,
        json: { statusMessage: 'Collection name taken' },
      }),
    )
    await page.goto('/u/retro_fan/shelf')
    await page.getByRole('button', { name: 'New collection' }).click()
    await page.getByLabel('Name').fill('Zelda Games')
    await page.getByRole('button', { name: 'Create collection' }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
      'You already have a collection with that name.',
    )
  })

  test('can edit and delete a collection, but not the Wishlist', async ({
    page,
  }) => {
    await page.goto('/u/retro_fan/shelf/zelda-games')
    await page.getByRole('button', { name: 'Collection actions' }).click()
    await expect(
      page.getByRole('menuitem', { name: 'Edit details' }),
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: 'Delete collection' }),
    ).toBeVisible()
    await page.keyboard.press('Escape')

    await page.route('**/api/u/retro_fan/collections/wishlist', (route) =>
      route.fulfill({ json: { ...zeldaDetail(true), ...wishlist, items: [] } }),
    )
    await page.goto('/u/retro_fan/shelf/wishlist')
    await page.getByRole('button', { name: 'Collection actions' }).click()
    await expect(
      page.getByRole('menuitem', { name: 'Edit details' }),
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: 'Delete collection' }),
    ).toBeHidden()
  })
})
