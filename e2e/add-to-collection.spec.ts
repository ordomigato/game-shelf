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
const owned = {
  ...summary,
  id: '55555555-5555-4555-8555-555555555555',
  title: 'Owned',
  slug: 'owned',
  kind: 'owned',
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
      route.fulfill({ json: [owned, wishlist, nes] }),
    )
  })

  test('marks results already in a collection', async ({ page }) => {
    let asked = ''
    await page.route('**/api/library-items/igdb?**', (route) => {
      asked = new URL(route.request().url()).searchParams.get('ids') ?? ''
      return route.fulfill({ json: [{ igdbId: 2, itemId }] })
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
    // The server answers with where the game is now: a custom collection
    // brings Owned along.
    const after: Record<string, string[]> = {
      [`PUT ${nes.id}`]: [wishlist.id, nes.id, owned.id],
      [`DELETE ${wishlist.id}`]: [nes.id, owned.id],
    }
    await page.route(`**/api/collections/*/items/${itemId}`, (route) => {
      const method = route.request().method()
      const collectionId = route.request().url().split('/').at(-3)
      linked.push(`${method} ${route.request().url().split('/api/')[1]}`)
      return route.fulfill({
        json: { collectionIds: after[`${method} ${collectionId}`] },
      })
    })

    await searchZelda(page)
    await page
      .getByRole('button', { name: 'Add to collection: Zelda Game 1' })
      .click()
    const menu = page.getByRole('menu')
    // Owned and the Wishlist come first.
    await expect(menu.getByRole('menuitemcheckbox')).toHaveText([
      'Owned',
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
    await expect(
      menu.getByRole('menuitemcheckbox', { name: 'Owned' }),
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

  test('unticking Owned asks first, and takes the game out of its collections', async ({
    page,
  }) => {
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [{ igdbId: 1, itemId }] }),
    )
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
          collectionIds: [owned.id, nes.id, wishlist.id],
        },
      }),
    )
    const removed: string[] = []
    await page.route(`**/api/collections/*/items/${itemId}`, (route) => {
      removed.push(
        `${route.request().method()} ${route.request().url().split('/api/')[1]}`,
      )
      return route.fulfill({ json: { collectionIds: [wishlist.id] } })
    })

    await searchZelda(page)
    await page
      .getByRole('button', { name: 'In your collections: Zelda Game 1' })
      .click()
    const box = (name: string) =>
      page.getByRole('menu').getByRole('menuitemcheckbox', { name })
    await box('Owned').click()
    const dialog = page.getByRole('alertdialog')
    await expect(
      dialog.getByRole('heading', { name: 'Remove Zelda Game 1 from Owned?' }),
    ).toBeVisible()
    await expect(dialog).toContainText('This also removes it from NES Games.')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    expect(removed).toEqual([])

    // The menu stays open behind the question.
    await expect(box('Owned')).toBeChecked()
    await box('Owned').click()
    await dialog.getByRole('button', { name: 'Remove' }).click()
    await expect(dialog).toBeHidden()
    await expect
      .poll(() => removed)
      .toEqual([`DELETE collections/${owned.id}/items/${itemId}`])
    await expect(box('Owned')).not.toBeChecked()
    await expect(box('NES Games')).not.toBeChecked()
    await expect(box('Wishlist')).toBeChecked()
  })

  test('opening the menu again asks nothing new, and shows the latest ticks', async ({
    page,
  }) => {
    const asked: string[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (request.method() === 'GET' && path.startsWith('/api/')) {
        asked.push(path)
      }
    })
    const count = (path: string) => asked.filter((p) => p === path).length
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [{ igdbId: 1, itemId }] }),
    )
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
          collectionIds: [wishlist.id],
        },
      }),
    )
    await page.route(`**/api/collections/${nes.id}/items/${itemId}`, (route) =>
      route.fulfill({ json: { collectionIds: [wishlist.id, nes.id] } }),
    )

    await searchZelda(page)
    const trigger = page.getByRole('button', {
      name: 'In your collections: Zelda Game 1',
    })
    const menu = page.getByRole('menu')
    const nesBox = menu.getByRole('menuitemcheckbox', { name: 'NES Games' })

    await trigger.click()
    await expect(
      menu.getByRole('menuitemcheckbox', { name: 'Wishlist' }),
    ).toBeChecked()
    await expect(nesBox).not.toBeChecked()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()

    await trigger.click()
    await expect(nesBox).not.toBeChecked()
    expect(count('/api/library-items/igdb/1')).toBe(1)
    expect(count('/api/collections')).toBeLessThanOrEqual(1)

    await nesBox.click()
    await expect(nesBox).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()

    await trigger.click()
    await expect(nesBox).toBeChecked()
    await expect(
      menu.getByRole('menuitemcheckbox', { name: 'Wishlist' }),
    ).toBeChecked()
    expect(count('/api/library-items/igdb/1')).toBe(1)
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
    await expect(
      page.getByText("Couldn't save that change. Try again."),
    ).toBeVisible()
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
      route.fulfill({ json: [{ igdbId: 1, itemId }] }),
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

  test('the game page and its menu ask once between them', async ({ page }) => {
    let asked = 0
    await page.route('**/api/library-items/igdb/1', (route) => {
      asked += 1
      return route.fulfill({ json: { item: null, collectionIds: [] } })
    })
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
      route.fulfill({ json: [] }),
    )
    await searchZelda(page)
    await page.getByRole('link', { name: 'Zelda Game 1' }).click()
    await expect(page).toHaveURL(/\/games\/1$/)
    await page.getByRole('button', { name: 'Add to collection' }).click()
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'NES Games' }),
    ).not.toBeChecked()
    expect(asked).toBe(1)
  })

  test.describe('from a collection', () => {
    test('adds and removes games in one click', async ({ page }) => {
      const asked: string[] = []
      await page.route('**/api/library-items/igdb?**', (route) => {
        asked.push(
          new URL(route.request().url()).searchParams.get('collection') ?? '',
        )
        return route.fulfill({ json: [{ igdbId: 2, itemId }] })
      })
      let created: unknown
      await page.route('**/api/library-items', (route) => {
        created = route.request().postDataJSON()
        return route.fulfill({
          json: {
            item: {
              id: '44444444-4444-4444-8444-444444444444',
              igdbId: 1,
              name: 'Zelda Game 1',
              coverId: null,
              data: {},
            },
            collectionIds: [nes.id],
          },
        })
      })
      const removed: string[] = []
      await page.route('**/api/collections/*/items/*', (route) => {
        removed.push(route.request().url().split('/api/')[1]!)
        return route.fulfill({ json: { collectionIds: [] } })
      })

      await page.route('**/api/games/search?**', (route) =>
        route.fulfill({ json: { games, page: 1, hasMore: false } }),
      )
      await page.goto('/?to=nes-games')
      await expect(page.getByText('Adding to NES Games')).toBeVisible()
      await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')

      const remove2 = page.getByRole('button', {
        name: 'Remove Zelda Game 2 from NES Games',
      })
      await expect(remove2).toBeVisible()
      expect(asked).toContain(nes.id)

      await page
        .getByRole('button', { name: 'Add Zelda Game 1 to NES Games' })
        .click()
      await expect(
        page.getByRole('button', {
          name: 'Remove Zelda Game 1 from NES Games',
        }),
      ).toBeVisible()
      expect(created).toEqual({
        igdbId: 1,
        name: 'Zelda Game 1',
        coverId: null,
        collectionIds: [nes.id],
      })

      await remove2.click()
      await expect(
        page.getByRole('button', { name: 'Add Zelda Game 2 to NES Games' }),
      ).toBeVisible()
      expect(removed).toEqual([`collections/${nes.id}/items/${itemId}`])

      await expect(page.getByRole('link', { name: 'Done' })).toHaveAttribute(
        'href',
        '/u/retro_fan/shelf/nes-games',
      )
    })

    test('can switch to another collection', async ({ page }) => {
      const asked: string[] = []
      await page.route('**/api/library-items/igdb?**', (route) => {
        asked.push(
          new URL(route.request().url()).searchParams.get('collection') ?? '',
        )
        return route.fulfill({ json: [] })
      })
      await page.route('**/api/games/search?**', (route) =>
        route.fulfill({ json: { games, page: 1, hasMore: false } }),
      )
      // Search renders on the server when the URL has a term, out of reach
      // of browser stubs, so type it.
      await page.goto('/?to=nes-games')
      await expect(page.getByText('Adding to NES Games')).toBeVisible()
      await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
      await page.getByRole('button', { name: 'Change' }).click()
      await page.getByRole('menuitemradio', { name: 'Wishlist' }).click()

      await expect(page.getByText('Adding to Wishlist')).toBeVisible()
      await expect(page).toHaveURL(/to=wishlist/)
      await expect(page).toHaveURL(/q=zelda/)
      await expect(
        page.getByRole('button', { name: 'Add Zelda Game 1 to Wishlist' }),
      ).toBeVisible()
      await expect.poll(() => asked).toContain(wishlist.id)
    })
  })
})

test('searching for a collection asks signed-out visitors to sign in', async ({
  page,
}) => {
  await page.goto('/?to=nes-games')
  await expect(page).toHaveURL(/\/login\?redirect=/)
})
