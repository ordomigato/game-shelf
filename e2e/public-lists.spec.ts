import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'
import { fakeList, type FakeEntry } from './support/lists'

const base = {
  coverId: null,
  releaseDate: null,
  releasePrecision: null,
  genres: [],
  data: {},
  inCollections: [],
}
const zelda: FakeEntry = {
  ...base,
  id: '30000000-0000-4000-8000-000000000001',
  igdbId: 1026,
  name: 'A Link to the Past',
  addedAt: '2026-05-02T10:00:00.000Z',
  platforms: ['SNES'],
}
const homebrew: FakeEntry = {
  ...base,
  id: '30000000-0000-4000-8000-000000000002',
  igdbId: null,
  name: 'Homebrew Cart',
  addedAt: '2026-05-01T10:00:00.000Z',
}

const summary = (extra: Record<string, unknown>) => ({
  description: null,
  color: null,
  visibility: 'public',
  itemCount: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})
const nes = summary({
  id: '10000000-0000-4000-8000-000000000001',
  title: 'NES Games',
  slug: 'nes-games',
})

test.describe('the owner', () => {
  test('switches Owned between private and public, and can share it', async ({
    page,
  }) => {
    await signInAs(page, { username: 'retro_fan' })
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    const owned = await fakeList(page, 'retro_fan', 'owned', [zelda])
    await page.goto('/u/retro_fan/shelf/owned')

    await page
      .getByRole('button', { name: 'Who can see this: Private' })
      .click()
    await page.getByRole('menuitem', { name: /Public/ }).click()
    await expect(
      page.getByRole('button', { name: 'Who can see this: Public' }),
    ).toBeVisible()
    await expect(page.getByText('Owned is now public')).toBeVisible()
    expect(owned.visibilitySaves).toEqual(['public'])

    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      /\/u\/retro_fan\/shelf\/owned$/,
    )

    await page.getByRole('button', { name: 'Who can see this: Public' }).click()
    await page.getByRole('menuitem', { name: /Private/ }).click()
    await expect(page.getByText('Owned is now private')).toBeVisible()
    expect(owned.visibilitySaves).toEqual(['public', 'private'])
  })

  test('asks before sharing a private Wishlist, then makes it public', async ({
    page,
  }) => {
    await signInAs(page, { username: 'retro_fan' })
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    const wishlist = await fakeList(page, 'retro_fan', 'wishlist', [zelda])
    await page.goto('/u/retro_fan/shelf/wishlist')
    await page.getByRole('button', { name: 'Share' }).click()
    await page.getByRole('button', { name: 'Make public and share' }).click()
    await expect(
      page.getByRole('button', { name: 'Who can see this: Public' }),
    ).toBeVisible()
    expect(wishlist.visibilitySaves).toEqual(['public'])
  })

  test('sees both lists on their shelf page, marked private', async ({
    page,
  }) => {
    await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/collections', (route) =>
      route.fulfill({ json: [nes] }),
    )
    await page.route('**/api/u/retro_fan/collections', (route) =>
      route.fulfill({ json: [nes] }),
    )
    await page.route('**/api/u/retro_fan/lists', (route) =>
      route.fulfill({
        json: [
          { list: 'owned', visibility: 'public', itemCount: 12 },
          { list: 'wishlist', visibility: 'private', itemCount: 3 },
        ],
      }),
    )
    await page.goto('/u/retro_fan/shelf')
    const owned = page.getByRole('main').getByRole('link', { name: /Owned/ })
    await expect(owned).toHaveAttribute('href', '/u/retro_fan/shelf/owned')
    await expect(owned).toContainText('12 games')
    await expect(owned).toContainText('Public')
    const wishlist = page
      .getByRole('main')
      .getByRole('link', { name: /Wishlist/ })
    await expect(wishlist).toHaveAttribute(
      'href',
      '/u/retro_fan/shelf/wishlist',
    )
    await expect(wishlist).toContainText('Private')
  })
})

test.describe('a visitor', () => {
  async function openPublic(page: Page, list: 'owned' | 'wishlist') {
    return fakeList(page, 'retro_fan', list, [zelda, homebrew], {
      visitor: true,
      visibility: 'public',
      platforms: [{ id: 1, name: 'SNES' }],
    })
  }

  test('reads a public Owned list, with platforms and nothing to change', async ({
    page,
  }) => {
    await openPublic(page, 'owned')
    await page.goto('/u/retro_fan/shelf/owned')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Owned' }),
    ).toBeVisible()
    await expect(page.getByTestId('list-usage')).toHaveText('2 games')
    const table = page.getByRole('table')
    await expect(table.getByRole('columnheader')).toHaveText([
      /Name/,
      /Released/,
      /Genre/,
      /Platforms/,
      /Added/,
    ])
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).getByText('SNES', { exact: true })).toBeVisible()

    // Read-only: no menus, no adding, no editing, no export.
    for (const name of [
      'Who can see this: Public',
      'List actions',
      'Columns',
      'Actions for A Link to the Past',
      'Choose platforms for A Link to the Past',
    ]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0)
    }
    await expect(page.getByRole('link', { name: 'Add games' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add games' })).toHaveCount(0)
    // The page can be shared, since it is public.
    await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
  })

  test('searches and sorts a public Wishlist on the server', async ({
    page,
  }) => {
    const wishlist = await openPublic(page, 'wishlist')
    await page.goto('/u/retro_fan/shelf/wishlist')
    const rows = page.getByRole('table').locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await page
      .getByRole('main')
      .getByRole('searchbox', { name: 'Search games' })
      .fill('homebrew')
    await expect(rows).toHaveCount(1)
    expect(wishlist.requests.at(-1)!.searchParams.get('q')).toBe('homebrew')
  })

  test('gets "not found" for a private list, like a private collection', async ({
    page,
  }) => {
    await page.route('**/api/u/retro_fan/lists/wishlist**', (route) =>
      route.fulfill({ status: 404, json: { statusMessage: 'Not found' } }),
    )
    await page.goto('/u/retro_fan/shelf/wishlist')
    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible()
  })

  test('finds only the public lists on the shelf page', async ({ page }) => {
    await page.route('**/api/u/retro_fan/collections', (route) =>
      route.fulfill({ json: [nes] }),
    )
    await page.route('**/api/u/retro_fan/lists', (route) =>
      route.fulfill({
        json: [{ list: 'owned', visibility: 'public', itemCount: 12 }],
      }),
    )
    await page.goto('/u/retro_fan/shelf')
    const owned = page.getByRole('main').getByRole('link', { name: /Owned/ })
    await expect(owned).toHaveAttribute('href', '/u/retro_fan/shelf/owned')
    // Nothing says the card is public, since the owner's views are the ones
    // that mark it.
    await expect(owned).not.toContainText('Public')
    await expect(
      page.getByRole('main').getByRole('link', { name: /Wishlist/ }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('main').getByRole('link', { name: /NES Games/ }),
    ).toBeVisible()
  })
})
