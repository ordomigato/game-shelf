import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const summary = {
  description: null,
  visibility: 'private',
  itemCount: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const snes = {
  ...summary,
  id: '10000000-0000-4000-8000-000000000008',
  title: 'SNES Games',
  slug: 'snes-games',
}
const rpg = {
  ...summary,
  id: '10000000-0000-4000-8000-000000000009',
  title: 'RPGs',
  slug: 'rpgs',
}
const inSnes = [
  { id: snes.id, title: 'SNES Games', slug: 'snes-games', color: null },
]
const inRpg = [{ id: rpg.id, title: 'RPGs', slug: 'rpgs', color: null }]
const base = {
  coverId: null,
  data: {},
  addedAt: '2026-01-01T00:00:00.000Z',
  owned: true,
  wishlisted: false,
  ownedOn: [],
  wantedOn: [],
  inCollections: inSnes,
}
// Chrono Trigger is only wanted, EarthBound is owned.
const items = [
  {
    ...base,
    id: '30000000-0000-4000-8000-000000000050',
    igdbId: 700,
    name: 'Chrono Trigger',
    owned: false,
    wishlisted: true,
  },
  {
    ...base,
    id: '30000000-0000-4000-8000-000000000051',
    igdbId: 701,
    name: 'EarthBound',
  },
]

const blueprint = {
  id: '20000000-0000-4000-8000-000000000007',
  name: null,
  shared: false,
  fields: [],
}

/** Stubs the collection page. `lists` is the user's collections. */
async function openCollection(
  page: Page,
  collection: typeof snes,
  lists: object[],
  rows: object[],
  options: {
    listStatus?: number
    /** Collections that refuse a game, over the plan's limit. */
    full?: string[]
    owner?: boolean
    visibility?: 'private' | 'public'
  } = {},
) {
  const { listStatus = 200, full = [], owner = true } = options
  if (owner) await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: lists }),
  )
  await page.route('**/api/lists', (route) =>
    route.fulfill({ json: { owned: 1, wishlist: 1 } }),
  )
  await page.route(
    `**/api/u/retro_fan/collections/${collection.slug}`,
    (route) =>
      route.fulfill({
        json: {
          ...collection,
          visibility: options.visibility ?? 'private',
          itemCount: rows.length,
          isOwner: owner,
          blueprint,
          items: rows,
        },
      }),
  )
  const changes: string[] = []
  await page.route('**/api/library-items/*/lists', (route) => {
    const request = route.request()
    const id = request.url().split('/').at(-2)
    const { type } = request.postDataJSON() as { type: string }
    changes.push(`${id} ${type}`)
    if (listStatus !== 200) return route.fulfill({ status: listStatus })
    return route.fulfill({
      json: {
        item: {
          ...base,
          id,
          owned: type === 'gotIt',
          wishlisted: type === 'toWishlist',
        },
        collectionIds: [],
      },
    })
  })
  const adds: string[] = []
  await page.route(/\/api\/collections\/[^/]+\/items\/[^/]+$/, (route) => {
    const url = route.request().url().split('/api/')[1]!
    adds.push(`${route.request().method()} ${url}`)
    if (full.some((id) => url.includes(id))) {
      return route.fulfill({
        status: 403,
        json: {
          statusCode: 403,
          data: {
            key: 'limits.reached.gamesPerCollection',
            params: { limit: 1000 },
          },
        },
      })
    }
    return route.fulfill({ json: { collectionIds: [] } })
  })
  await page.goto(`/u/retro_fan/shelf/${collection.slug}`)
  await expect(page.getByRole('table')).toBeVisible()
  return { changes, adds }
}

const openSnes = (
  page: Page,
  lists: object[] = [snes, rpg],
  rows: object[] = items,
  options: Parameters<typeof openCollection>[4] = {},
) => openCollection(page, snes, lists, rows, options)

async function gotIt(page: Page, name: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  // One click: no submenu.
  await page.getByRole('menuitem', { name: 'Got it' }).click()
}

test('"Got it" flips a wanted game at once and offers the collections', async ({
  page,
}) => {
  const { changes, adds } = await openSnes(page)
  const row = page.locator('tbody tr').first()
  await expect(row).toHaveClass(/is-wanted/)
  await expect(row.getByText('Wanted', { exact: true })).toBeVisible()

  await gotIt(page, 'Chrono Trigger')

  // It stays in the collection, no longer wanted.
  await expect(page.getByText('Moved to Owned')).toBeVisible()
  await expect(row).toContainText('Chrono Trigger')
  await expect(row).not.toHaveClass(/is-wanted/)
  await expect(row.getByText('Wanted', { exact: true })).toHaveCount(0)
  expect(changes).toEqual([`${items[0]!.id} gotIt`])

  // It's in SNES Games already, so only RPGs is offered.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Add Chrono Trigger')).toBeVisible()
  await expect(
    dialog.getByRole('checkbox', { name: 'SNES Games' }),
  ).toHaveCount(0)
  await dialog.getByRole('checkbox', { name: 'RPGs' }).click()
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(adds).toEqual([`PUT collections/${rpg.id}/items/${items[0]!.id}`])
  await expect(page.getByText('Added to RPGs')).toBeVisible()
})

test('skipping the popup adds nothing', async ({ page }) => {
  const { adds } = await openSnes(page)
  await gotIt(page, 'Chrono Trigger')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Skip' }).click()
  await expect(dialog).toBeHidden()
  expect(adds).toEqual([])
})

test('the popup leaves out collections the game is already in', async ({
  page,
}) => {
  await openSnes(
    page,
    undefined,
    items.map((item) => ({ ...item, inCollections: inRpg })),
  )
  await gotIt(page, 'Chrono Trigger')
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('checkbox', { name: 'SNES Games' }),
  ).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: 'RPGs' })).toHaveCount(0)
})

test('a collection that is full is named, and the rest still go in', async ({
  page,
}) => {
  const { adds } = await openSnes(
    page,
    undefined,
    items.map((item) => ({ ...item, inCollections: [] })),
    { full: [rpg.id] },
  )
  await gotIt(page, 'Chrono Trigger')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox', { name: 'SNES Games' }).click()
  await dialog.getByRole('checkbox', { name: 'RPGs' }).click()
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(
    page.getByText(
      'A collection or your Wishlist can hold up to 1000 games on your plan.',
    ),
  ).toBeVisible()
  await expect(page.getByText('Added to SNES Games')).toBeVisible()
  // The one that went in is gone from the list, and only RPGs is left.
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('checkbox')).toHaveCount(1)
  await expect(dialog.getByRole('checkbox', { name: 'RPGs' })).toBeChecked()
  expect(adds).toHaveLength(2)
})

test('"Got it" when the game is in every collection has no popup', async ({
  page,
}) => {
  const everywhere = [snes, rpg].map(({ id, title, slug }) => ({
    id,
    title,
    slug,
    color: null,
  }))
  const { changes } = await openSnes(
    page,
    undefined,
    items.map((item) => ({ ...item, inCollections: everywhere })),
  )
  await gotIt(page, 'Chrono Trigger')
  await expect(page.getByText('Moved to Owned')).toBeVisible()
  expect(changes).toHaveLength(1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a failed flip leaves the game as it was', async ({ page }) => {
  await openSnes(page, undefined, undefined, { listStatus: 500 })
  await gotIt(page, 'Chrono Trigger')
  await expect(
    page.getByText("Couldn't move that game. Try again."),
  ).toBeVisible()
  await expect(page.locator('tbody tr').first()).toHaveClass(/is-wanted/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('"Move to Wishlist" is for owned games, and keeps them in the collection', async ({
  page,
}) => {
  const { changes } = await openSnes(page)
  // A wanted game is offered "Got it" instead.
  await page.getByRole('button', { name: 'Actions for Chrono Trigger' }).click()
  await expect(
    page.getByRole('menuitem', { name: 'Move to Wishlist' }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Actions for EarthBound' }).click()
  await expect(page.getByRole('menuitem', { name: 'Got it' })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Move to Wishlist' }).click()
  await expect(page.getByText('Moved to Wishlist')).toBeVisible()
  const row = page.locator('tbody tr').nth(1)
  await expect(row.getByRole('link', { name: 'EarthBound' })).toBeVisible()
  await expect(row).toHaveClass(/is-wanted/)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(changes).toEqual([`${items[1]!.id} toWishlist`])
})

test.describe('Add to', () => {
  const rows = [
    { ...items[0]!, inCollections: inSnes },
    { ...items[1]!, inCollections: [...inSnes, ...inRpg] },
  ]
  const lists = [snes, rpg]

  test('adds a game to another collection and keeps it here', async ({
    page,
  }) => {
    const { adds, changes } = await openCollection(page, snes, lists, rows)
    await page
      .getByRole('button', { name: 'Actions for Chrono Trigger' })
      .click()
    // The keyboard way in: focus "Add to", open its submenu, pick.
    await page.getByRole('menuitem', { name: 'Add to' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('menuitem', { name: 'RPGs' })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page.getByText('Added to RPGs')).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Chrono Trigger' }),
    ).toBeVisible()
    // Its lists are left alone.
    expect(changes).toEqual([])
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
  await openSnes(page)
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

test.describe('Wanted games in a collection', () => {
  test('fade and carry a badge, with no heart button', async ({ page }) => {
    await openSnes(page)
    const rows = page.locator('table tbody tr')
    await expect(rows.nth(0)).toHaveClass(/is-wanted/)
    await expect(rows.nth(1)).not.toHaveClass(/is-wanted/)
    await expect(rows.nth(0).locator('.wanted-fade').first()).toHaveCSS(
      'opacity',
      '0.5',
    )
    await expect(rows.nth(0).getByText('Wanted', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Wishlist:/ })).toHaveCount(0)
  })

  test('a game owned on one version and wanted on another is not faded', async ({
    page,
  }) => {
    await openSnes(page, undefined, [
      { ...items[1]!, wishlisted: true, ownedOn: [12], wantedOn: [48] },
    ])
    const row = page.locator('table tbody tr').first()
    await expect(row).not.toHaveClass(/is-wanted/)
    await expect(row.getByText('Wanted', { exact: true })).toBeVisible()
  })

  test('can be filtered', async ({ page }) => {
    await openSnes(page)
    await page.getByRole('button', { name: 'Filter' }).click()
    await page.getByRole('menuitem', { name: 'Owned or wanted' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Owned' }).click()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('table').locator('tbody tr').getByRole('link'),
    ).toHaveText(['EarthBound'])
  })

  test('visitors see the badge but have no menu', async ({ page }) => {
    await openSnes(page, undefined, undefined, {
      owner: false,
      visibility: 'public',
    })
    await expect(
      page
        .locator('table tbody tr')
        .nth(0)
        .getByText('Wanted', { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /Actions for/ })).toHaveCount(
      0,
    )
  })
})
