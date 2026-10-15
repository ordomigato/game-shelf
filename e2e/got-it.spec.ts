import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const summary = {
  description: null,
  visibility: 'private',
  itemCount: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const wishlist = {
  ...summary,
  id: '10000000-0000-4000-8000-000000000007',
  title: 'Wishlist',
  slug: 'wishlist',
  kind: 'wishlist',
}
const snes = {
  ...summary,
  id: '10000000-0000-4000-8000-000000000008',
  title: 'SNES Games',
  slug: 'snes-games',
  kind: 'custom',
}
const items = ['Chrono Trigger', 'EarthBound'].map((name, i) => ({
  id: `30000000-0000-4000-8000-00000000005${i}`,
  igdbId: 700 + i,
  name,
  coverId: null,
  data: {},
  addedAt: '2026-01-01T00:00:00.000Z',
}))

const owned = {
  ...summary,
  id: '10000000-0000-4000-8000-000000000006',
  title: 'Owned',
  slug: 'owned',
  kind: 'owned',
}
const rpg = {
  ...summary,
  id: '10000000-0000-4000-8000-000000000009',
  title: 'RPGs',
  slug: 'rpgs',
  kind: 'custom',
}

const blueprint = {
  id: '20000000-0000-4000-8000-000000000007',
  name: null,
  shared: false,
  fields: [],
}

/** Stubs the list and the collection page. `lists` is what the user has. */
async function openCollection(
  page: Page,
  list: typeof wishlist,
  lists: object[],
  rows: object[],
  moveStatus = 204,
) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: lists }),
  )
  await page.route(`**/api/u/retro_fan/collections/${list.slug}`, (route) =>
    route.fulfill({
      json: {
        ...list,
        itemCount: rows.length,
        isOwner: true,
        blueprint,
        items: rows,
      },
    }),
  )
  await page.route('**/api/u/retro_fan/collections/rpgs', (route) =>
    route.fulfill({
      json: { ...rpg, isOwner: true, blueprint, items: [] },
    }),
  )
  const moves: unknown[] = []
  await page.route('**/api/collections/*/items/*/move', (route) => {
    moves.push({
      url: route.request().url().split('/api/')[1],
      body: route.request().postDataJSON(),
    })
    return route.fulfill({ status: moveStatus })
  })
  const adds: string[] = []
  await page.route(/\/api\/collections\/[^/]+\/items\/[^/]+$/, (route) => {
    adds.push(
      `${route.request().method()} ${route.request().url().split('/api/')[1]}`,
    )
    return route.fulfill({ json: { collectionIds: [] } })
  })
  await page.goto(`/u/retro_fan/shelf/${list.slug}`)
  await expect(page.getByRole('table')).toBeVisible()
  return { moves, adds }
}

const openWishlist = (
  page: Page,
  lists: object[] = [owned, wishlist, snes, rpg],
  moveStatus = 204,
) => openCollection(page, wishlist, lists, items, moveStatus)

async function gotIt(page: Page, name: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  // One click: no submenu.
  await page.getByRole('menuitem', { name: 'Got it' }).click()
}

test('"Got it" moves a game to Owned at once and offers the collections', async ({
  page,
}) => {
  const { moves, adds } = await openWishlist(page)
  await gotIt(page, 'Chrono Trigger')

  await expect(page.getByRole('link', { name: 'Chrono Trigger' })).toHaveCount(
    0,
  )
  await expect(page.getByText('Moved to Owned')).toBeVisible()
  expect(moves).toEqual([
    {
      url: `collections/${wishlist.id}/items/${items[0]!.id}/move`,
      body: { toCollectionIds: [owned.id] },
    },
  ])

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Add Chrono Trigger')).toBeVisible()
  await dialog.getByRole('checkbox', { name: 'SNES Games' }).click()
  await dialog.getByRole('checkbox', { name: 'RPGs' }).click()
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(adds).toEqual([
    `PUT collections/${snes.id}/items/${items[0]!.id}`,
    `PUT collections/${rpg.id}/items/${items[0]!.id}`,
  ])
  await expect(page.getByText('Added to SNES Games, RPGs')).toBeVisible()
})

test('skipping the popup adds nothing', async ({ page }) => {
  const { adds } = await openWishlist(page)
  await gotIt(page, 'Chrono Trigger')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Skip' }).click()
  await expect(dialog).toBeHidden()
  expect(adds).toEqual([])
})

test('"Got it" with no collections of your own has no popup', async ({
  page,
}) => {
  const { moves } = await openWishlist(page, [owned, wishlist])
  await gotIt(page, 'Chrono Trigger')
  await expect(page.getByText('Moved to Owned')).toBeVisible()
  expect(moves).toHaveLength(1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a failed move puts the game back', async ({ page }) => {
  await openWishlist(page, [owned, wishlist, snes], 500)
  await gotIt(page, 'EarthBound')
  await expect(
    page.getByText("Couldn't move that game. Try again."),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'EarthBound' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test.describe('Add to', () => {
  const rows = [
    { ...items[0]!, inCollections: [] },
    {
      ...items[1]!,
      inCollections: [{ id: rpg.id, title: 'RPGs', slug: 'rpgs', color: null }],
    },
  ]
  const lists = [owned, wishlist, snes, rpg]

  test('adds a game to another collection and keeps it here', async ({
    page,
  }) => {
    const { adds, moves } = await openCollection(page, snes, lists, rows)
    await page
      .getByRole('button', { name: 'Actions for Chrono Trigger' })
      .click()
    // The keyboard way in: focus "Add to", open its submenu, pick.
    await page.getByRole('menuitem', { name: 'Add to' }).focus()
    await page.keyboard.press('ArrowRight')
    // The Wishlist is not offered.
    await expect(page.getByRole('menuitem', { name: 'Wishlist' })).toHaveCount(
      0,
    )
    await expect(page.getByRole('menuitem', { name: 'RPGs' })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page.getByText('Added to RPGs')).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Chrono Trigger' }),
    ).toBeVisible()
    expect(moves).toEqual([])
    expect(adds).toEqual([`PUT collections/${rpg.id}/items/${items[0]!.id}`])

    await page.getByRole('button', { name: 'View' }).click()
    await expect(page).toHaveURL(/\/u\/retro_fan\/shelf\/rpgs$/)
  })

  test('leaves out collections the game is already in', async ({ page }) => {
    await openCollection(page, snes, lists, rows)
    await page.getByRole('button', { name: 'Actions for EarthBound' }).click()
    await page.getByRole('menuitem', { name: 'Add to' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(
      page.getByRole('menuitem', { name: 'No other collections to add to' }),
    ).toBeVisible()
  })
})

test('the pinned name matches the row while its menu is open', async ({
  page,
}) => {
  await openWishlist(page)
  // By CSS: an open menu hides the rest of the page from role queries.
  const name = page.locator('table tbody tr').first().locator('.pinned-cell')
  const closed = await name.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  )
  // Opened from the keyboard, so the row is never hovered.
  await page.getByRole('button', { name: 'Actions for Chrono Trigger' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await expect
    .poll(() => name.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(closed)
})

test.describe('Wishlist games in other collections', () => {
  async function openSnes(page: Page, owner = true) {
    if (owner) await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/collections', (route) =>
      route.fulfill({ json: [wishlist, snes] }),
    )
    await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
      route.fulfill({
        json: {
          ...snes,
          visibility: 'public',
          itemCount: items.length,
          isOwner: owner,
          blueprint: {
            id: '20000000-0000-4000-8000-000000000008',
            name: null,
            shared: false,
            fields: [],
          },
          items: items.map((item, i) => ({ ...item, wishlisted: i === 1 })),
        },
      }),
    )
    const calls: string[] = []
    await page.route(`**/api/collections/${wishlist.id}/items/*`, (route) => {
      calls.push(
        `${route.request().method()} ${route.request().url().split('/').pop()}`,
      )
      return route.fulfill({ json: { collectionIds: [] } })
    })
    await page.goto('/u/retro_fan/shelf/snes-games')
    await expect(page.getByRole('table')).toBeVisible()
    return calls
  }

  test('fade, and the heart puts them on or off the Wishlist', async ({
    page,
  }) => {
    const calls = await openSnes(page)
    const rows = page.locator('table tbody tr')
    await expect(rows.nth(1)).toHaveClass(/is-wishlisted/)
    await expect(rows.nth(0)).not.toHaveClass(/is-wishlisted/)
    await expect(rows.nth(1).locator('.wishlist-fade').first()).toHaveCSS(
      'opacity',
      '0.5',
    )

    const earthbound = page.getByRole('button', {
      name: 'On your Wishlist: EarthBound',
    })
    await expect(earthbound).toHaveAttribute('aria-pressed', 'true')
    await earthbound.click()
    await expect(earthbound).toHaveAttribute('aria-pressed', 'false')
    await expect(rows.nth(1)).not.toHaveClass(/is-wishlisted/)

    await page
      .getByRole('button', { name: 'On your Wishlist: Chrono Trigger' })
      .click()
    await expect(rows.nth(0)).toHaveClass(/is-wishlisted/)
    expect(calls).toEqual([`DELETE ${items[1]!.id}`, `PUT ${items[0]!.id}`])
  })

  test('can be filtered', async ({ page }) => {
    await openSnes(page)
    await page.getByRole('button', { name: 'Filter' }).click()
    await page.getByRole('menuitem', { name: 'Wishlist' }).click()
    await page
      .getByRole('menuitemcheckbox', { name: 'Not on your Wishlist' })
      .click()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('table').locator('tbody tr').getByRole('link'),
    ).toHaveText(['Chrono Trigger'])
  })

  test('visitors see the heart but cannot change it', async ({ page }) => {
    await openSnes(page, false)
    await expect(
      page.getByRole('button', { name: /On your Wishlist/ }),
    ).toHaveCount(0)
    await expect(
      page.locator('table tbody tr').nth(1).getByText('On the Wishlist'),
    ).toBeAttached()
  })
})
