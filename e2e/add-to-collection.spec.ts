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
const nes = {
  ...summary,
  id: '22222222-2222-4222-8222-222222222222',
  title: 'NES Games',
  slug: 'nes-games',
}
const nesLink = {
  id: nes.id,
  title: 'NES Games',
  slug: 'nes-games',
  color: null,
}
const itemId = '33333333-3333-4333-8333-333333333333'
const platforms = [
  { id: 12, name: 'X360' },
  { id: 48, name: 'PS4' },
]
/** The item as the server sends it: owned only, unless `extra` says more. */
const itemOf = (extra: Record<string, unknown> = {}) => ({
  id: itemId,
  igdbId: 1,
  name: 'Zelda Game 1',
  coverId: null,
  data: {},
  owned: true,
  wishlisted: false,
  ownedOn: [],
  wantedOn: [],
  ...extra,
})
const wantedOnly = { owned: false, wishlisted: true }

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

const gameStub = {
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
      route.fulfill({ json: [nes] }),
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

  test('adds a new game to the Wishlist, links it to a collection, then takes it off', async ({
    page,
  }) => {
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [] }),
    )
    await page.route('**/api/library-items/igdb/1', (route) =>
      route.fulfill({ json: { item: null, collectionIds: [], platforms: [] } }),
    )
    let created: unknown
    await page.route('**/api/library-items', (route) => {
      created = route.request().postDataJSON()
      return route.fulfill({
        json: { item: itemOf(wantedOnly), collectionIds: [] },
      })
    })
    const calls: string[] = []
    await page.route(`**/api/library-items/${itemId}/collections`, (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: [nesLink] })
      }
      calls.push(`PUT collections ${route.request().postData()}`)
      return route.fulfill({ json: { collectionIds: [nes.id] } })
    })
    await page.route(`**/api/library-items/${itemId}/lists`, (route) => {
      calls.push(`PUT lists ${JSON.stringify(route.request().postDataJSON())}`)
      return route.fulfill({ json: { item: null, collectionIds: [] } })
    })

    await searchZelda(page)
    await page
      .getByRole('button', { name: 'Add to collection: Zelda Game 1' })
      .click()
    const menu = page.getByRole('menu')
    const box = (name: string) =>
      menu.getByRole('menuitemcheckbox', { name, exact: true })
    // Owned and the Wishlist come first, then the collections.
    await expect(menu.getByRole('menuitemcheckbox')).toHaveText([
      'Owned',
      'Wishlist',
      'NES Games',
    ])

    await box('Wishlist').click()
    await expect(box('Wishlist')).toBeChecked()
    await expect(box('Owned')).not.toBeChecked()
    expect(created).toEqual({
      igdbId: 1,
      name: 'Zelda Game 1',
      coverId: null,
      collectionIds: [],
      list: 'wishlist',
    })

    // The menu stays open, so a second tick only links the same item, and
    // leaves its lists alone.
    await box('NES Games').click()
    await expect(box('NES Games')).toBeChecked()
    await expect(box('Wishlist')).toBeChecked()
    await expect(box('Owned')).not.toBeChecked()

    // On no other list, so taking it off deletes it: the question names
    // the collection it leaves.
    await box('Wishlist').click()
    const dialog = page.getByRole('alertdialog')
    await expect(
      dialog.getByRole('heading', {
        name: 'Remove Zelda Game 1 from your Wishlist?',
      }),
    ).toBeVisible()
    await expect(dialog).toContainText('It also leaves NES Games.')
    await dialog.getByRole('button', { name: 'Remove' }).click()
    await expect(box('Wishlist')).not.toBeChecked()
    await expect(box('NES Games')).not.toBeChecked()
    expect(calls).toEqual([
      `PUT collections {"add":["${nes.id}"],"remove":[]}`,
      'PUT lists {"type":"unwant"}',
    ])

    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('button', { name: 'Add to collection: Zelda Game 1' }),
    ).toBeVisible()
  })

  test('ticking Owned on a wanted game gets it', async ({ page }) => {
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [{ igdbId: 1, itemId }] }),
    )
    await page.route('**/api/library-items/igdb/1', (route) =>
      route.fulfill({
        json: { item: itemOf(wantedOnly), collectionIds: [], platforms: [] },
      }),
    )
    let sent: unknown
    await page.route(`**/api/library-items/${itemId}/lists`, (route) => {
      sent = route.request().postDataJSON()
      return route.fulfill({ json: { item: itemOf(), collectionIds: [] } })
    })
    await searchZelda(page)
    await page
      .getByRole('button', { name: 'In your collections: Zelda Game 1' })
      .click()
    const box = (name: string) =>
      page
        .getByRole('menu')
        .getByRole('menuitemcheckbox', { name, exact: true })
    await expect(box('Wishlist')).toBeChecked()
    await box('Owned').click()
    await expect(box('Owned')).toBeChecked()
    await expect(box('Wishlist')).not.toBeChecked()
    expect(sent).toEqual({ type: 'own' })
  })

  test('the checklist adds and removes without changing the list', async ({
    page,
  }) => {
    const snes = {
      ...nes,
      id: '55555555-5555-4555-8555-555555555555',
      title: 'SNES Games',
      slug: 'snes-games',
    }
    const rpgs = {
      ...nes,
      id: '66666666-6666-4666-8666-666666666666',
      title: 'RPGs',
      slug: 'rpgs',
    }
    await page.route('**/api/collections', (route) =>
      route.fulfill({ json: [nes, snes, rpgs] }),
    )
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [{ igdbId: 1, itemId }] }),
    )
    await page.route('**/api/library-items/igdb/1', (route) =>
      route.fulfill({
        json: { item: itemOf(), collectionIds: [nes.id], platforms: [] },
      }),
    )
    const sent: { add: string[]; remove: string[] }[] = []
    let inside = [nes.id]
    let finish: (() => void) | undefined
    await page.route(
      `**/api/library-items/${itemId}/collections`,
      async (route) => {
        const change = route.request().postDataJSON() as {
          add: string[]
          remove: string[]
        }
        sent.push(change)
        await new Promise<void>((resolve) => (finish = resolve))
        inside = [...inside, ...change.add].filter(
          (id) => !change.remove.includes(id),
        )
        return route.fulfill({ json: { collectionIds: inside } })
      },
    )

    await searchZelda(page)
    await page
      .getByRole('button', { name: 'In your collections: Zelda Game 1' })
      .click()
    const menu = page.getByRole('menu')
    const boxes = menu.getByRole('menuitemcheckbox')
    const box = (name: string) =>
      menu.getByRole('menuitemcheckbox', { name, exact: true })
    const all = ['Owned', 'Wishlist', 'NES Games', 'SNES Games', 'RPGs']
    await expect(boxes).toHaveText(all)
    await expect(box('NES Games')).toBeChecked()

    // While it saves, the collections can't be changed.
    await box('SNES Games').click()
    await expect(box('RPGs')).toBeDisabled()
    await expect(box('NES Games')).toBeDisabled()
    await expect(box('SNES Games')).toBeDisabled()
    expect(sent).toEqual([{ add: [snes.id], remove: [] }])
    finish?.()
    await expect(box('SNES Games')).toBeEnabled()
    await expect(box('SNES Games')).toBeChecked()
    await expect(menu).toBeVisible()
    await expect(boxes).toHaveText(all)

    // Unticking sends only that collection and keeps the entry in the list.
    await box('NES Games').click()
    await expect(box('NES Games')).toBeDisabled()
    finish?.()
    await expect(box('NES Games')).toBeEnabled()
    await expect(box('NES Games')).not.toBeChecked()
    await expect(box('SNES Games')).toBeChecked()
    expect(sent[1]).toEqual({ add: [], remove: [nes.id] })
    await expect(menu).toBeVisible()
    await expect(boxes).toHaveText(all)
  })

  test('a new game ticked into a collection is created owned', async ({
    page,
  }) => {
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [] }),
    )
    await page.route('**/api/library-items/igdb/1', (route) =>
      route.fulfill({ json: { item: null, collectionIds: [], platforms: [] } }),
    )
    let created: unknown
    await page.route('**/api/library-items', (route) => {
      created = route.request().postDataJSON()
      return route.fulfill({
        json: { item: itemOf(), collectionIds: [nes.id] },
      })
    })
    await searchZelda(page)
    await page
      .getByRole('button', { name: 'Add to collection: Zelda Game 1' })
      .click()
    const menu = page.getByRole('menu')
    await menu.getByRole('menuitemcheckbox', { name: 'NES Games' }).click()
    await expect(
      menu.getByRole('menuitemcheckbox', { name: 'Owned' }),
    ).toBeChecked()
    expect(created).toEqual({
      igdbId: 1,
      name: 'Zelda Game 1',
      coverId: null,
      collectionIds: [nes.id],
    })
  })

  test('unticking Owned asks first, naming the collections the game leaves', async ({
    page,
  }) => {
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [{ igdbId: 1, itemId }] }),
    )
    await page.route('**/api/library-items/igdb/1', (route) =>
      route.fulfill({
        json: { item: itemOf(), collectionIds: [nes.id], platforms: [] },
      }),
    )
    await page.route(`**/api/library-items/${itemId}/collections`, (route) =>
      route.fulfill({ json: [nesLink] }),
    )
    const removed: string[] = []
    await page.route(`**/api/library-items/${itemId}/lists`, (route) => {
      removed.push(JSON.stringify(route.request().postDataJSON()))
      return route.fulfill({ json: { item: null, collectionIds: [] } })
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
    await expect(dialog).toContainText('It also leaves NES Games.')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    expect(removed).toEqual([])

    // The menu stays open behind the question.
    await expect(box('Owned')).toBeChecked()
    await box('Owned').click()
    await dialog.getByRole('button', { name: 'Remove' }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => removed).toEqual(['{"type":"unown"}'])
    await expect(box('Owned')).not.toBeChecked()
    await expect(box('NES Games')).not.toBeChecked()
  })

  test('a game owned on one version and wanted on another clears one side at a time', async ({
    page,
  }) => {
    const both = itemOf({ wishlisted: true, ownedOn: [12], wantedOn: [48] })
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [{ igdbId: 1, itemId }] }),
    )
    await page.route('**/api/library-items/igdb/1', (route) =>
      route.fulfill({
        json: { item: both, collectionIds: [nes.id], platforms },
      }),
    )
    let asked = false
    await page.route(`**/api/library-items/${itemId}/collections`, (route) => {
      asked = true
      return route.fulfill({ json: [] })
    })
    const sent: string[] = []
    await page.route(`**/api/library-items/${itemId}/lists`, (route) => {
      const body = route.request().postDataJSON() as { type: string }
      sent.push(body.type)
      return route.fulfill({
        json: {
          item: { ...both, owned: false, ownedOn: [] },
          collectionIds: [nes.id],
        },
      })
    })

    await searchZelda(page)
    await page
      .getByRole('button', { name: 'In your collections: Zelda Game 1' })
      .click()
    const menu = page.getByRole('menu')
    const box = (name: string) =>
      menu.getByRole('menuitemcheckbox', { name, exact: true })
    await expect(box('Owned')).toBeChecked()
    await expect(box('Wishlist')).toBeChecked()

    // It stays on the Wishlist, so there is nothing to ask.
    await box('Owned').click()
    await expect(box('Owned')).not.toBeChecked()
    await expect(box('Wishlist')).toBeChecked()
    await expect(box('NES Games')).toBeChecked()
    expect(sent).toEqual(['unown'])
    expect(asked).toBe(false)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  })

  test('picks the platforms a game is owned or wanted on', async ({ page }) => {
    await page.route('**/api/library-items/igdb?**', (route) =>
      route.fulfill({ json: [] }),
    )
    await page.route('**/api/library-items/igdb/1', (route) =>
      route.fulfill({ json: { item: null, collectionIds: [], platforms } }),
    )
    let created: unknown
    await page.route('**/api/library-items', (route) => {
      created = route.request().postDataJSON()
      return route.fulfill({
        json: { item: itemOf({ ownedOn: [12] }), collectionIds: [] },
      })
    })
    const sent: unknown[] = []
    await page.route(`**/api/library-items/${itemId}/lists`, (route) => {
      sent.push(route.request().postDataJSON())
      return route.fulfill({
        json: {
          item: itemOf({ wishlisted: true, ownedOn: [12], wantedOn: [48] }),
          collectionIds: [],
        },
      })
    })

    await searchZelda(page)
    await page
      .getByRole('button', { name: 'Add to collection: Zelda Game 1' })
      .click()
    await page.getByRole('menuitem', { name: 'Owned on' }).click()
    const x360 = page.getByRole('menuitemcheckbox', { name: 'X360' })
    await x360.click()
    await expect(x360).toBeChecked()
    expect(created).toEqual({
      igdbId: 1,
      name: 'Zelda Game 1',
      coverId: null,
      collectionIds: [],
      list: 'owned',
      platforms: [12],
    })

    // Wanting it on another platform puts it on both lists, as two versions.
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
    await page
      .getByRole('button', { name: 'In your collections: Zelda Game 1' })
      .click()
    await page.getByRole('menuitem', { name: 'Wishlisted on' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'PS4' }).click()
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'PS4' }),
    ).toBeChecked()
    expect(sent).toEqual([{ type: 'setWantedOn', platforms: [48] }])
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
        json: { item: itemOf(wantedOnly), collectionIds: [], platforms: [] },
      }),
    )
    await page.route(`**/api/library-items/${itemId}/collections`, (route) =>
      route.fulfill({ json: { collectionIds: [nes.id] } }),
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
      route.fulfill({ json: { item: null, collectionIds: [], platforms: [] } }),
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
        json: { item: itemOf(), collectionIds: [nes.id], platforms: [] },
      }),
    )
    await page.route('**/api/games/1', (route) =>
      route.fulfill({ json: gameStub }),
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
      return route.fulfill({
        json: { item: null, collectionIds: [], platforms: [] },
      })
    })
    await page.route('**/api/games/1', (route) =>
      route.fulfill({ json: gameStub }),
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
            item: itemOf({ id: '44444444-4444-4444-8444-444444444444' }),
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

    test('can switch to another collection or a list', async ({ page }) => {
      const asked: string[] = []
      await page.route('**/api/library-items/igdb?**', (route) => {
        const query = new URL(route.request().url()).searchParams
        asked.push(query.get('collection') ?? query.get('list') ?? '')
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
      await expect(page.getByRole('menuitemradio')).toHaveText([
        'Owned',
        'Wishlist',
        'NES Games',
      ])
      await page.getByRole('menuitemradio', { name: 'Wishlist' }).click()

      await expect(page.getByText('Adding to Wishlist')).toBeVisible()
      await expect(page).toHaveURL(/to=wishlist/)
      await expect(page).toHaveURL(/q=zelda/)
      await expect(
        page.getByRole('button', { name: 'Add Zelda Game 1 to Wishlist' }),
      ).toBeVisible()
      await expect.poll(() => asked).toContain('wishlist')
      await expect(page.getByRole('link', { name: 'Done' })).toHaveAttribute(
        'href',
        '/u/retro_fan/shelf/wishlist',
      )
    })

    test('adds to the Wishlist in one click, and takes a game off Owned', async ({
      page,
    }) => {
      await page.route('**/api/library-items/igdb?**', (route) =>
        route.fulfill({ json: [{ igdbId: 2, itemId }] }),
      )
      await page.route('**/api/library-items/igdb/2', (route) =>
        route.fulfill({
          json: {
            item: itemOf({ igdbId: 2 }),
            collectionIds: [],
            platforms: [],
          },
        }),
      )
      const bodies: unknown[] = []
      await page.route('**/api/library-items', (route) => {
        bodies.push(route.request().postDataJSON())
        return route.fulfill({
          json: { item: itemOf(wantedOnly), collectionIds: [] },
        })
      })
      await page.route(`**/api/library-items/${itemId}/collections`, (route) =>
        route.fulfill({ json: [] }),
      )
      const lists: unknown[] = []
      await page.route(`**/api/library-items/${itemId}/lists`, (route) => {
        lists.push(route.request().postDataJSON())
        return route.fulfill({ json: { item: null, collectionIds: [] } })
      })
      await page.route('**/api/games/search?**', (route) =>
        route.fulfill({ json: { games, page: 1, hasMore: false } }),
      )

      await page.goto('/?to=wishlist')
      await expect(page.getByText('Adding to Wishlist')).toBeVisible()
      await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
      await page
        .getByRole('button', { name: 'Add Zelda Game 1 to Wishlist' })
        .click()
      await expect(
        page.getByRole('button', {
          name: 'Remove Zelda Game 1 from Wishlist',
        }),
      ).toBeVisible()
      expect(bodies).toEqual([
        {
          igdbId: 1,
          name: 'Zelda Game 1',
          coverId: null,
          collectionIds: [],
          list: 'wishlist',
        },
      ])

      // Zelda Game 2 is on Owned only. Taking it off deletes it, and it's in
      // no collections, so there's nothing to ask.
      await page.goto('/?to=owned')
      await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
      await page
        .getByRole('button', { name: 'Remove Zelda Game 2 from Owned' })
        .click()
      await expect(
        page.getByRole('button', { name: 'Add Zelda Game 2 to Owned' }),
      ).toBeVisible()
      expect(lists).toEqual([{ type: 'unown' }])
    })
  })
})

test('searching for a collection asks signed-out visitors to sign in', async ({
  page,
}) => {
  await page.goto('/?to=nes-games')
  await expect(page).toHaveURL(/\/login\?redirect=/)
})
