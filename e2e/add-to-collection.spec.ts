import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const games = [1, 2].map((id) => ({
  id,
  name: `Zelda Game ${id}`,
  coverId: null,
  year: 1986,
  platforms: ['NES'],
}))

const summary = {
  description: null,
  visibility: 'private',
  itemCount: 0,
  updatedAt: '2026-10-01T00:00:00.000Z',
}
const wishlist = {
  ...summary,
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Wishlist',
  slug: 'wishlist',
  kind: 'wishlist',
}
const nes = {
  ...summary,
  id: '22222222-2222-4222-8222-222222222222',
  title: 'NES Games',
  slug: 'nes-games',
  kind: 'custom',
}
const itemId = '33333333-3333-4333-8333-333333333333'

async function searchZelda(page: Page) {
  await page.route('**/api/games/search?**', (route) =>
    route.fulfill({ json: { games, page: 1, hasMore: false } }),
  )
  await page.goto('/')
  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
  await expect(
    page.getByRole('heading', { name: 'Zelda Game 1' }),
  ).toBeVisible()
}

test('signed-out visitors are sent to sign in first', async ({ page }) => {
  await searchZelda(page)
  await page
    .getByRole('button', { name: 'Add to collection: Zelda Game 1' })
    .click()
  await expect(page).toHaveURL(/\/login\?redirect=/)
})

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/collections', (route) =>
      route.fulfill({ json: [wishlist, nes] }),
    )
  })

  test('marks results already in a collection', async ({ page }) => {
    let asked = ''
    await page.route('**/api/library-items/igdb?**', (route) => {
      asked = new URL(route.request().url()).searchParams.get('ids') ?? ''
      return route.fulfill({ json: [2] })
    })
    await searchZelda(page)
    await expect(
      page.getByRole('button', { name: 'In your collections: Zelda Game 2' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Add to collection: Zelda Game 1' }),
    ).toBeVisible()
    expect(asked).toBe('1,2')
  })

  test('adds a new game, then links it to another collection and back out', async ({
    page,
  }) => {
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [] }),
    )
    await page.route('**/api/library-items/igdb/1', (route) =>
      route.fulfill({ json: { item: null, collectionIds: [] } }),
    )
    let created: unknown
    await page.route('**/api/library-items', (route) => {
      created = route.request().postDataJSON()
      return route.fulfill({
        json: {
          item: {
            id: itemId,
            igdbId: 1,
            name: 'Zelda Game 1',
            coverId: null,
            data: {},
          },
          collectionIds: [wishlist.id],
        },
      })
    })
    const linked: string[] = []
    await page.route(`**/api/collections/*/items/${itemId}`, (route) => {
      linked.push(
        `${route.request().method()} ${route.request().url().split('/api/')[1]}`,
      )
      return route.fulfill({ status: 204 })
    })

    await searchZelda(page)
    await page
      .getByRole('button', { name: 'Add to collection: Zelda Game 1' })
      .click()
    const menu = page.getByRole('menu')
    // The Wishlist comes first.
    await expect(menu.getByRole('menuitemcheckbox')).toHaveText([
      'Wishlist',
      'NES Games',
    ])

    await menu.getByRole('menuitemcheckbox', { name: 'Wishlist' }).click()
    await expect(
      menu.getByRole('menuitemcheckbox', { name: 'Wishlist' }),
    ).toBeChecked()
    expect(created).toEqual({
      igdbId: 1,
      name: 'Zelda Game 1',
      coverId: null,
      collectionIds: [wishlist.id],
    })

    // The menu stays open, so a second tick only links the same item.
    await menu.getByRole('menuitemcheckbox', { name: 'NES Games' }).click()
    await expect(
      menu.getByRole('menuitemcheckbox', { name: 'NES Games' }),
    ).toBeChecked()
    await menu.getByRole('menuitemcheckbox', { name: 'Wishlist' }).click()
    await expect(
      menu.getByRole('menuitemcheckbox', { name: 'Wishlist' }),
    ).not.toBeChecked()
    expect(linked).toEqual([
      `PUT collections/${nes.id}/items/${itemId}`,
      `DELETE collections/${wishlist.id}/items/${itemId}`,
    ])

    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('button', { name: 'In your collections: Zelda Game 1' }),
    ).toBeVisible()
  })

  test('undoes the tick and says so when saving fails', async ({ page }) => {
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [] }),
    )
    await page.route('**/api/library-items/igdb/1', (route) =>
      route.fulfill({ json: { item: null, collectionIds: [] } }),
    )
    await page.route('**/api/library-items', (route) =>
      route.fulfill({ status: 500, json: {} }),
    )
    await searchZelda(page)
    await page
      .getByRole('button', { name: 'Add to collection: Zelda Game 1' })
      .click()
    const menu = page.getByRole('menu')
    await menu.getByRole('menuitemcheckbox', { name: 'Wishlist' }).click()
    await expect(menu.getByRole('alert')).toHaveText(
      "Couldn't save that change. Try again.",
    )
    await expect(
      menu.getByRole('menuitemcheckbox', { name: 'Wishlist' }),
    ).not.toBeChecked()
  })

  test('the game page shows when the game is already in a collection', async ({
    page,
  }) => {
    await page.route('**/api/library-items/igdb/1', (route) =>
      route.fulfill({
        json: {
          item: {
            id: itemId,
            igdbId: 1,
            name: 'Zelda Game 1',
            coverId: null,
            data: {},
          },
          collectionIds: [nes.id],
        },
      }),
    )
    await page.route('**/api/games/1', (route) =>
      route.fulfill({
        json: {
          id: 1,
          name: 'Zelda Game 1',
          coverId: null,
          releaseDate: null,
          summary: null,
          platforms: [],
          genres: [],
          developers: [],
          publishers: [],
          screenshotIds: [],
          igdbUrl: null,
        },
      }),
    )
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [1] }),
    )
    // Game pages render on the server, out of reach of browser stubs, so
    // open it from search like a person would.
    await searchZelda(page)
    await page.getByRole('link', { name: 'Zelda Game 1' }).click()
    await expect(page).toHaveURL(/\/games\/1$/)
    const button = page.getByRole('button', { name: 'In your collections' })
    await expect(button).toBeVisible()
    await button.click()
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'NES Games' }),
    ).toBeChecked()
  })
})
