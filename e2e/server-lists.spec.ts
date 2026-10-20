import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { fakeList, type FakeEntry } from './support/lists'
import { signInAs } from './support/session'

const fields = [
  { id: 'score', name: 'Score', type: 'rating', scale: 10 },
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: ['Playing', 'Done'],
  },
  { id: 'note', name: 'Note', type: 'text', hidden: true as const },
]

const game = (i: number, list: 'owned' | 'wishlist'): FakeEntry => ({
  id: `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  igdbId: 1000 + i,
  name: `Game ${String(i).padStart(3, '0')}`,
  coverId: null,
  year: null,
  genres: [],
  addedAt: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
  data: {
    ...(i % 3 === 0 ? {} : { score: i % 10 }),
    status: i % 2 ? 'Playing' : 'Done',
  },
  owned: list === 'owned',
  wishlisted: list === 'wishlist',
  ownedOn: [],
  wantedOn: [],
  wanted: list === 'wishlist',
  inCollections: [],
  platforms: [],
})
const games = (list: 'owned' | 'wishlist') =>
  Array.from({ length: 120 }, (_, i) => game(i + 1, list))

async function openList(
  page: Page,
  list: 'owned' | 'wishlist' = 'owned',
  delay?: (request: number) => number,
) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/lists', (route) =>
    route.fulfill({ json: { owned: 120, wishlist: 120 } }),
  )
  return fakeList(page, 'retro_fan', list, games(list), { fields, delay })
}

const names = (page: Page) =>
  page
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map((row) => /Game \d{3}/.exec(row.textContent ?? '')?.[0] ?? ''),
    )

test('shows one page at a time and pages through the list', async ({
  page,
}) => {
  const list = await openList(page)
  await page.goto('/u/retro_fan/shelf/owned')
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(50)
  await expect(rows.first()).toContainText('Game 120')
  await expect(page.getByText('1–50 of 120')).toBeVisible()
  expect(list.requests).toHaveLength(1)
  expect(list.requests[0]!.searchParams.get('size')).toBe('50')

  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByText('51–100 of 120')).toBeVisible()
  await expect(rows.first()).toContainText('Game 070')
  expect(list.requests.at(-1)!.searchParams.get('page')).toBe('2')

  // The same place after a reload.
  await page.reload()
  await expect(page.getByText('51–100 of 120')).toBeVisible()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByText('101–120 of 120')).toBeVisible()
  await expect(rows).toHaveCount(20)
  await page.goBack()
  await expect(page.getByText('51–100 of 120')).toBeVisible()
})

test('remembers rows per page, and the address names it', async ({ page }) => {
  const list = await openList(page)
  await page.goto('/u/retro_fan/shelf/owned')
  await expect(page.locator('tbody tr')).toHaveCount(50)
  await page.getByRole('combobox', { name: 'Per page' }).click()
  await page.getByRole('option', { name: '25', exact: true }).click()
  await expect(page).toHaveURL(/size=25/)
  await expect(page.locator('tbody tr')).toHaveCount(25)
  expect(list.requests.at(-1)!.searchParams.get('size')).toBe('25')

  // A fresh visit to the list uses the remembered number.
  await page.goto('/u/retro_fan/shelf/owned')
  await expect(page.locator('tbody tr')).toHaveCount(25)
  await expect(page.getByText('1–25 of 120')).toBeVisible()
})

test('sorts on the server by a field, empty values last, and back undoes it', async ({
  page,
}) => {
  const list = await openList(page)
  await page.goto('/u/retro_fan/shelf/owned')
  await expect(page.locator('tbody tr')).toHaveCount(50)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/page=2/)

  await page.getByRole('button', { name: 'Score', exact: true }).click()
  // A new sort starts again from the first page. Numbers go highest first.
  await expect(page).toHaveURL(/sort=f\.score/)
  await expect(page).toHaveURL(/dir=desc/)
  await expect(page).not.toHaveURL(/page=2/)
  expect(list.requests.at(-1)!.searchParams.get('sort')).toBe('f.score')
  await expect(page.locator('tbody tr').first()).toContainText('Game 119')
  await expect(
    page.getByRole('columnheader', { name: /Score/ }),
  ).toHaveAttribute('aria-sort', 'descending')

  await page.getByRole('button', { name: 'Score', exact: true }).click()
  await expect(page).toHaveURL(/dir=asc/)
  // Games with no score come last, newest first.
  await expect(page.locator('tbody tr').first()).toContainText('Game 110')

  await page.goBack()
  await expect(page).toHaveURL(/dir=desc/)
  await expect(page.locator('tbody tr').first()).toContainText('Game 119')
  await page.goBack()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.locator('tbody tr').first()).toContainText('Game 070')
})

test('shows the account fields as columns, hidden ones with a lock', async ({
  page,
}) => {
  await openList(page)
  await page.goto('/u/retro_fan/shelf/owned')
  await expect(page.getByRole('columnheader')).toHaveText([
    /Name/,
    /Collections/,
    /Platforms/,
    /Score/,
    /Status/,
    /Note/,
    /Added/,
    'Actions',
  ])
  await expect(
    page
      .getByRole('columnheader', { name: /Note/ })
      .getByRole('img', { name: 'Hidden from visitors' }),
  ).toBeVisible()
  await expect(
    page.getByRole('columnheader', { name: /Status/ }).getByRole('img'),
  ).toHaveCount(0)
})

test('searches names after a pause in typing, once, and keeps it in the address', async ({
  page,
}) => {
  const list = await openList(page)
  await page.goto('/u/retro_fan/shelf/owned')
  await expect(page.locator('tbody tr')).toHaveCount(50)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/page=2/)

  const search = page
    .getByRole('main')
    .getByRole('searchbox', { name: 'Search games' })
  const before = list.requests.length
  await search.pressSequentially('game 07', { delay: 40 })
  await expect(page).toHaveURL(/q=game\+07|q=game%2007/)
  await expect(page).not.toHaveURL(/page=2/)
  await expect(page.locator('tbody tr')).toHaveCount(10)
  expect(await names(page)).toContain('Game 070')
  await expect(page.getByText('Showing 10 of 120')).toBeVisible()
  // Typing without a pause made one request, not one per letter.
  expect(list.requests.slice(before)).toHaveLength(1)
  expect(list.requests.at(-1)!.searchParams.get('q')).toBe('game 07')

  await page.reload()
  await expect(search).toHaveValue('game 07')
  await expect(page.locator('tbody tr')).toHaveCount(10)

  await search.fill('nothing like it')
  await expect(page.getByText('No games match.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(50)
  await expect(search).toHaveValue('')
})

test('an older answer never replaces a newer one, and old rows stay while loading', async ({
  page,
}) => {
  // The second request (the first search) is slow.
  const list = await openList(page, 'owned', (n) => (n === 2 ? 1500 : 0))
  await page.goto('/u/retro_fan/shelf/owned')
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(50)
  const search = page
    .getByRole('main')
    .getByRole('searchbox', { name: 'Search games' })
  await search.fill('Game 010')
  await expect.poll(() => list.requests.length).toBe(2)
  // The page keeps its rows, dimmed, while the answer is on its way.
  await expect(rows).toHaveCount(50)
  await expect(page.locator('[aria-busy="true"]')).toBeVisible()
  await search.fill('Game 011')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Game 011')
  await page.waitForTimeout(1800)
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Game 011')
})

test('filters by a field choice on the server and starts again from page 1', async ({
  page,
}) => {
  const list = await openList(page)
  await page.goto('/u/retro_fan/shelf/owned')
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/page=2/)
  await page.getByRole('button', { name: 'Filter' }).click()
  await page.getByRole('menuitem', { name: 'Status' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Done' }).click()
  await expect(page).toHaveURL(/f\.status=Done/)
  await expect(page).not.toHaveURL(/page=2/)
  await expect(page.getByText('Showing 60 of 120')).toBeVisible()
  expect(list.requests.at(-1)!.searchParams.getAll('f.status')).toEqual([
    'Done',
  ])
  const shown = await names(page)
  expect(shown).toHaveLength(50)
  expect(shown.every((name) => Number(name.slice(5)) % 2 === 0)).toBe(true)
})

test('"Got it" takes the game off the page at once, then fills the gap', async ({
  page,
}) => {
  // Refetches after the first are slow, so the gap shows.
  const list = await openList(page, 'wishlist', (n) => (n >= 2 ? 800 : 0))
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/library-items/*/lists', (route) => {
    const id = route.request().url().split('/').at(-2)!
    list.remove(id)
    return route.fulfill({
      json: {
        item: { ...game(120, 'owned'), id },
        collectionIds: [],
      },
    })
  })
  await page.goto('/u/retro_fan/shelf/wishlist')
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(50)
  await expect(
    page.locator('p[aria-live="polite"]', { hasText: '120 games' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Game 120' }).click()
  await page.getByRole('menuitem', { name: 'Got it' }).click()
  await expect(rows).toHaveCount(49)
  await expect(
    page.locator('p[aria-live="polite"]', { hasText: '119 games' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Game 120' })).toHaveCount(0)
  // Not dimmed: it's a quiet refetch.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  // Then the page is filled from the server.
  await expect(rows).toHaveCount(50)
  await expect(rows.last()).toContainText('Game 070')
  expect(list.requests).toHaveLength(2)
})

test('exports the whole list from the server, not the rows on screen', async ({
  page,
}) => {
  const list = await openList(page)
  const csv = '﻿Name,IGDB ID,Added,Score\r\nGame 001,1001,2026-01-01,1\r\n'
  let exported = 0
  await page.route('**/api/lists/owned/export', (route) => {
    exported += 1
    return route.fulfill({ body: csv, contentType: 'text/csv' })
  })
  await page.goto('/u/retro_fan/shelf/owned')
  await page
    .getByRole('main')
    .getByRole('searchbox', { name: 'Search games' })
    .fill('Game 010')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export all 120 games' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('owned.csv')
  expect(await readFile((await file.path())!, 'utf8')).toBe(csv)
  expect(exported).toBe(1)
  expect(list.requests.length).toBeGreaterThan(0)
})

test('a failing page shows the error with a retry', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  let fail = true
  await page.route(/\/api\/u\/retro_fan\/lists\/owned(\?.*)?$/, (route) =>
    fail
      ? route.fulfill({ status: 500, json: { statusCode: 500 } })
      : route.fulfill({
          json: {
            list: 'owned',
            itemCount: 0,
            total: 0,
            page: 1,
            size: 50,
            fields: [],
            platforms: [],
            items: [],
          },
        }),
  )
  await page.goto('/u/retro_fan/shelf/owned')
  await expect(page.getByText("Couldn't load this list.")).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Owned' }),
  ).toBeVisible()
})

test('a value saved while moving to another page does not send you back', async ({
  page,
}) => {
  const list = await openList(page)
  let saves = 0
  await page.route('**/api/library-items/*/values', async (route) => {
    const id = route.request().url().split('/').at(-2)!
    const { values } = route.request().postDataJSON() as {
      values: Record<string, string>
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const item = list.items.find((entry) => entry.id === id)!
    const data = { ...item.data, ...values }
    list.update(id, { data })
    saves += 1
    await route.fulfill({ json: { id, data } })
  })
  await page.goto('/u/retro_fan/shelf/owned')
  await expect(page.locator('tbody tr')).toHaveCount(50)
  await page.getByRole('combobox', { name: 'Status for Game 120' }).click()
  await page.getByRole('option', { name: 'Playing' }).click()
  // The save is still on its way when the next page is asked for.
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect.poll(() => saves).toBe(1)
  await expect(page.getByText('51–100 of 120')).toBeVisible()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.locator('tbody tr').first()).toContainText('Game 070')
})
