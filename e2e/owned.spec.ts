import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'
import { fakeList } from './support/lists'

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
const customSummary = {
  description: null,
  visibility: 'private',
  itemCount: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const lists = { owned: 3, wishlist: 1 }

let ownedList: Awaited<ReturnType<typeof fakeList>>
let wishlistList: Awaited<ReturnType<typeof fakeList>>

const base = {
  coverId: null,
  releaseDate: null,
  releasePrecision: null,
  genres: [],
  data: {},
  owned: true,
  wishlisted: false,
  ownedOn: [],
  wantedOn: [],
}
const linkToThePast = {
  ...base,
  id: '30000000-0000-4000-8000-000000000001',
  igdbId: 1026,
  name: 'A Link to the Past',
  addedAt: '2026-05-02T10:00:00.000Z',
  inCollections: [snes, zelda],
  platforms: ['SNES'],
}
const homebrew = {
  ...base,
  id: '30000000-0000-4000-8000-000000000002',
  igdbId: null,
  name: 'Homebrew Cart',
  addedAt: '2026-05-01T10:00:00.000Z',
  inCollections: [],
  platforms: [],
}
// Owned on Xbox 360, and also wanted on PS4.
const gtaV = {
  ...base,
  id: '30000000-0000-4000-8000-000000000003',
  igdbId: 1020,
  name: 'Grand Theft Auto V',
  addedAt: '2026-04-01T10:00:00.000Z',
  wishlisted: true,
  ownedOn: [12],
  wantedOn: [48],
  inCollections: [],
  platforms: ['X360'],
}
const chrono = {
  ...base,
  id: '30000000-0000-4000-8000-000000000004',
  igdbId: 1070,
  name: 'Chrono Trigger',
  addedAt: '2026-03-01T10:00:00.000Z',
  owned: false,
  wishlisted: true,
  wantedOn: [19],
  inCollections: [zelda],
  platforms: ['SNES'],
}

/**
 * Stubs the sidebar's calls and the two list pages. `listDelay` is how
 * long the user's collections take to arrive.
 */
async function openLists(page: Page, listDelay = 0) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', async (route) => {
    if (listDelay)
      await new Promise((resolve) => setTimeout(resolve, listDelay))
    await route.fulfill({
      json: [
        { ...customSummary, ...zelda },
        { ...customSummary, ...snes },
      ],
    })
  })
  await page.route('**/api/lists', (route) => route.fulfill({ json: lists }))
  ownedList = await fakeList(page, 'retro_fan', 'owned', [
    linkToThePast,
    homebrew,
    gtaV,
  ])
  wishlistList = await fakeList(page, 'retro_fan', 'wishlist', [
    chrono,
    { ...gtaV, platforms: ['PS4'] },
  ])
  const calls: string[] = []
  await page.route('**/api/library-items/*/lists', (route) => {
    const request = route.request()
    const id = request.url().split('/').at(-2)
    const { type } = request.postDataJSON() as { type: string }
    calls.push(`${request.method()} ${id} ${type}`)
    const states: Record<string, object | null> = {
      gotIt: { owned: true, wishlisted: false },
      toWishlist: { owned: false, wishlisted: true },
      // Grand Theft Auto V is on both lists, so it stays on the other.
      unown: id === gtaV.id ? { owned: false, wishlisted: true } : null,
      unwant: id === gtaV.id ? { owned: true, wishlisted: false } : null,
    }
    const state = states[type]
    // The server drops the game from a list it is no longer on.
    if (!state || !state.owned) ownedList.remove(id)
    if (!state || !state.wishlisted) wishlistList.remove(id)
    return route.fulfill({
      json: {
        item: state && { ...base, id, ...state },
        collectionIds: [],
      },
    })
  })
  await page.route('**/api/library-items/*/collections', (route) => {
    const id = route.request().url().split('/').at(-2)
    calls.push(`GET ${id} collections`)
    return route.fulfill({
      json: id === linkToThePast.id ? linkToThePast.inCollections : [],
    })
  })
  return calls
}

/**
 * Stubs changing a game's collections. Collects what was sent, as
 * "<item id> +<added ids> -<removed ids>", and answers with the collections
 * the game is in after the change.
 */
async function stubAdds(page: Page) {
  const adds: string[] = []
  const inside = new Map<string, string[]>(
    [linkToThePast, homebrew, gtaV, chrono].map((item) => [
      item.id,
      item.inCollections.map(({ id }) => id),
    ]),
  )
  await page.route('**/api/library-items/*/collections', (route) => {
    const { add, remove } = route.request().postDataJSON() as {
      add: string[]
      remove: string[]
    }
    const id = route.request().url().split('/').at(-2)!
    adds.push(`${id} +${add.join(',')} -${remove.join(',')}`)
    const now = [...(inside.get(id) ?? []), ...add].filter(
      (collectionId, i, all) =>
        !remove.includes(collectionId) && all.indexOf(collectionId) === i,
    )
    inside.set(id, now)
    const links = [zelda, snes].filter((c) => now.includes(c.id))
    ownedList.update(id, { inCollections: links })
    wishlistList.update(id, { inCollections: links })
    return route.fulfill({ json: { collectionIds: now } })
  })
  return adds
}

test('the sidebar fixes Owned above the Wishlist, with counts', async ({
  page,
}) => {
  await openLists(page)
  await page.goto('/account/settings')
  const sidebar = page.getByRole('complementary')
  await expect(
    sidebar.getByRole('link', { name: /^(Owned|Wishlist)/ }),
  ).toHaveText([/Owned\s*3/, /Wishlist\s*1/])
  await sidebar.getByRole('link', { name: /^Owned/ }).click()
  await expect(page).toHaveURL('/u/retro_fan/shelf/owned')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Owned' }),
  ).toBeVisible()
  // Neither list is a collection, so neither is among them.
  await expect(sidebar.getByRole('link', { name: 'Zelda Games' })).toBeVisible()
})

test('Owned shows the shared columns, with the collections and platforms', async ({
  page,
}) => {
  await openLists(page)
  await page.goto('/u/retro_fan/shelf/owned')
  const table = page.getByRole('table')
  await expect(table.getByRole('columnheader')).toHaveText([
    /Name/,
    /Collections/,
    /Released/,
    /Genre/,
    /Platforms/,
    /Added/,
    'Actions',
  ])
  const rows = table.locator('tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(
    rows.nth(0).getByRole('link', { name: 'Zelda Games' }),
  ).toHaveAttribute('href', '/u/retro_fan/shelf/zelda-games')
  await expect(rows.nth(0).getByText('SNES', { exact: true })).toHaveCount(2)
  await expect(rows.nth(2).getByText('X360')).toBeVisible()

  // The server searches the game's name.
  const search = page
    .getByRole('main')
    .getByRole('searchbox', { name: 'Search games' })
  await search.fill('homebrew')
  await expect(rows).toHaveCount(1)
  await expect(page).toHaveURL(/q=homebrew/)
  await search.fill('')
  await expect(rows).toHaveCount(3)

  // No fields, order, charts, import or sharing.
  await expect(
    page.getByRole('button', { name: 'Table', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Collection actions' }),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Actions for A Link to the Past' })
    .click()
  await expect(
    page.getByRole('menuitem', { name: 'Move to Wishlist' }),
  ).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: 'Remove from Owned' }),
  ).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: 'Add to', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Move to top' })).toHaveCount(
    0,
  )
})

test('/owned opens the Owned list', async ({ page }) => {
  await openLists(page)
  await page.goto('/owned')
  await expect(page).toHaveURL('/u/retro_fan/shelf/owned')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Owned' }),
  ).toBeVisible()
})

test('someone else gets a not found page for both lists', async ({ page }) => {
  for (const list of ['owned', 'wishlist']) {
    await page.route(
      new RegExp(`/api/u/someone/lists/${list}(\\?.*)?$`),
      (route) => route.fulfill({ status: 404, json: { statusCode: 404 } }),
    )
    await page.goto(`/u/someone/shelf/${list}`)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeVisible()
  }
})

test('removing a game on no other list asks first, naming its collections', async ({
  page,
}) => {
  const calls = await openLists(page)
  await page.goto('/u/retro_fan/shelf/owned')
  const remove = async (name: string) => {
    await page.getByRole('button', { name: `Actions for ${name}` }).click()
    await page.getByRole('menuitem', { name: 'Remove from Owned' }).click()
  }

  await remove('A Link to the Past')
  const dialog = page.getByRole('alertdialog')
  await expect(
    dialog.getByRole('heading', {
      name: 'Remove A Link to the Past from Owned?',
    }),
  ).toBeVisible()
  // The collections come from the server, not the page.
  await expect(dialog).toContainText('It also leaves SNES and Zelda Games.')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  expect(calls).toEqual([`GET ${linkToThePast.id} collections`])

  await remove('A Link to the Past')
  await dialog.getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  expect(calls.at(-1)).toBe(`PUT ${linkToThePast.id} unown`)

  // In no collection: nothing to ask.
  await remove('Homebrew Cart')
  await expect(dialog).toBeHidden()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  expect(calls.at(-1)).toBe(`PUT ${homebrew.id} unown`)
})

test('removing a game that is on the other list too clears only this side', async ({
  page,
}) => {
  const calls = await openLists(page)
  await page.goto('/u/retro_fan/shelf/owned')
  await page
    .getByRole('button', { name: 'Actions for Grand Theft Auto V' })
    .click()
  await page.getByRole('menuitem', { name: 'Remove from Owned' }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.locator('tbody tr')).toHaveCount(2)
  expect(calls).toEqual([`PUT ${gtaV.id} unown`])
})

test('"Move to Wishlist" only flips the game over', async ({ page }) => {
  const calls = await openLists(page)
  await page.goto('/u/retro_fan/shelf/owned')
  await page
    .getByRole('button', { name: 'Actions for A Link to the Past' })
    .click()
  await page.getByRole('menuitem', { name: 'Move to Wishlist' }).click()
  await expect(page.getByText('Moved to Wishlist')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await expect(
    page.getByRole('link', { name: 'A Link to the Past' }),
  ).toHaveCount(0)
  expect(calls).toEqual([`PUT ${linkToThePast.id} toWishlist`])
  // No question: the game stays in its collections.
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

test('the Wishlist has its own rows, platforms and "Got it"', async ({
  page,
}) => {
  const calls = await openLists(page)
  await page.goto('/u/retro_fan/shelf/wishlist')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Wishlist' }),
  ).toBeVisible()
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(
    rows.filter({ hasText: 'Grand Theft Auto V' }).getByText('PS4'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Chrono Trigger' }).click()
  await expect(
    page.getByRole('menuitem', { name: 'Move to Wishlist' }),
  ).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Got it' }).click()
  await expect(page.getByText('Moved to Owned')).toBeVisible()
  await expect(rows).toHaveCount(1)
  expect(calls).toEqual([`PUT ${chrono.id} gotIt`])

  // The offer lists only collections the game isn't in: it was in Zelda Games.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('checkbox', { name: 'SNES' })).toBeVisible()
  await expect(
    dialog.getByRole('checkbox', { name: 'Zelda Games' }),
  ).toHaveCount(0)
})

/** Opens a row's menu and its "Add to" submenu, the keyboard way. */
async function openAddTo(page: Page, name: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Add to' }).focus()
  await page.keyboard.press('ArrowRight')
}

/** Ticks or unticks a collection in the open "Add to" submenu. */
async function pick(page: Page, collection: string) {
  await page.getByRole('menuitemcheckbox', { name: collection }).focus()
  await page.keyboard.press('Enter')
}

test('"Got it" on the Wishlist offers the collections, even slow ones', async ({
  page,
}) => {
  await openLists(page, 1500)
  await page.goto('/u/retro_fan/shelf/wishlist')
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page
    .getByRole('button', { name: 'Actions for Grand Theft Auto V' })
    .click()
  await page.getByRole('menuitem', { name: 'Got it' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('checkbox', { name: 'SNES' })).toBeVisible()
  await expect(
    dialog.getByRole('checkbox', { name: 'Zelda Games' }),
  ).toBeVisible()
})

test('Owned: "Add to" ticks and unticks collections, and leaves its lists alone', async ({
  page,
}) => {
  const calls = await openLists(page)
  const adds = await stubAdds(page)
  await page.goto('/u/retro_fan/shelf/owned')
  const row = page.locator('tbody tr', { hasText: 'Homebrew Cart' })
  await openAddTo(page, 'Homebrew Cart')
  const boxes = page.getByRole('menuitemcheckbox')
  await expect(boxes).toHaveText(['Zelda Games', 'SNES'])
  await pick(page, 'Zelda Games')
  await expect(row.locator('a', { hasText: 'Zelda Games' })).toBeVisible()
  expect(adds).toEqual([`${homebrew.id} +${zelda.id} -`])

  // The menu stays open with every collection in place, ticked or not.
  await expect(boxes).toHaveText(['Zelda Games', 'SNES'])
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Zelda Games' }),
  ).toBeChecked()
  await pick(page, 'SNES')
  await expect(row.locator('a', { hasText: 'SNES' })).toBeVisible()
  expect(adds.at(-1)).toBe(`${homebrew.id} +${snes.id} -`)
  await pick(page, 'Zelda Games')
  await expect(row.locator('a', { hasText: 'Zelda Games' })).toHaveCount(0)
  expect(adds.at(-1)).toBe(`${homebrew.id} + -${zelda.id}`)
  await expect(boxes).toHaveText(['Zelda Games', 'SNES'])

  // Still on Owned, and no list change was sent.
  await expect(page.locator('tbody tr')).toHaveCount(3)
  expect(calls).toEqual([])
})

test('Wishlist: "Add to" keeps the game wanted', async ({ page }) => {
  const calls = await openLists(page)
  const adds = await stubAdds(page)
  await page.goto('/u/retro_fan/shelf/wishlist')
  const row = page.locator('tbody tr', { hasText: 'Chrono Trigger' })
  await openAddTo(page, 'Chrono Trigger')
  // It's in Zelda Games already.
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Zelda Games' }),
  ).toBeChecked()
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'SNES' }),
  ).not.toBeChecked()
  await pick(page, 'SNES')
  await expect(row.locator('a', { hasText: 'SNES' })).toBeVisible()
  await expect(row.locator('a', { hasText: 'Zelda Games' })).toBeVisible()
  expect(adds).toEqual([`${chrono.id} +${snes.id} -`])
  await expect(page.locator('tbody tr')).toHaveCount(2)
  expect(calls).toEqual([])
})

test('Owned: the + beside a game’s collections opens a dialog to change them', async ({
  page,
}) => {
  const calls = await openLists(page)
  const adds = await stubAdds(page)
  await page.goto('/u/retro_fan/shelf/owned')
  const row = page.locator('tbody tr', { hasText: 'Homebrew Cart' })
  await row
    .getByRole('button', { name: 'Choose collections for Homebrew Cart' })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: 'Collections for Homebrew Cart' }),
  ).toBeVisible()
  await expect(dialog.getByRole('checkbox')).toHaveCount(2)
  await dialog.getByRole('checkbox', { name: 'Zelda Games' }).click()
  // Nothing is saved until Save.
  expect(adds).toEqual([])
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  expect(adds).toEqual([`${homebrew.id} +${zelda.id} -`])
  await expect(row.locator('a', { hasText: 'Zelda Games' })).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  expect(calls).toEqual([])
})

test('Wishlist: the + dialog starts from the game’s collections and can leave one', async ({
  page,
}) => {
  await openLists(page)
  const adds = await stubAdds(page)
  await page.goto('/u/retro_fan/shelf/wishlist')
  const row = page.locator('tbody tr', { hasText: 'Chrono Trigger' })
  await row
    .getByRole('button', { name: 'Choose collections for Chrono Trigger' })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('checkbox', { name: 'Zelda Games' }),
  ).toBeChecked()
  await dialog.getByRole('checkbox', { name: 'Zelda Games' }).click()
  await dialog.getByRole('checkbox', { name: 'SNES' }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  expect(adds).toEqual([`${chrono.id} +${snes.id} -${zelda.id}`])
  await expect(row.locator('a', { hasText: 'SNES' })).toBeVisible()
  await expect(row.locator('a', { hasText: 'Zelda Games' })).toHaveCount(0)
  await expect(page.locator('tbody tr')).toHaveCount(2)
})

test('a collection deleted elsewhere reloads the page and the collections', async ({
  page,
}) => {
  await openLists(page)
  await page.route('**/api/library-items/*/collections', (route) =>
    route.fulfill({ status: 404, json: { statusCode: 404 } }),
  )
  await page.goto('/u/retro_fan/shelf/owned')
  await expect(page.locator('tbody tr')).toHaveCount(3)
  const reloads: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET') reloads.push(path)
  })
  const row = page.locator('tbody tr', { hasText: 'Homebrew Cart' })
  await row
    .getByRole('button', { name: 'Choose collections for Homebrew Cart' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox', { name: 'Zelda Games' }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(
    page.getByText("Couldn't save the collections. Try again."),
  ).toBeVisible()
  await expect
    .poll(() => reloads.filter((path) => path === '/api/collections').length)
    .toBeGreaterThan(0)
  await expect
    .poll(
      () =>
        reloads.filter((path) => path === '/api/u/retro_fan/lists/owned')
          .length,
    )
    .toBeGreaterThan(0)
})
