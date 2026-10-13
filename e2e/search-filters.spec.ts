import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/** Opens search and waits for the filter lists, so the page is ready. */
async function openSearch(page: Page, url = '/') {
  await Promise.all([
    page.waitForResponse('**/api/games/filters'),
    page.goto(url),
  ])
}

const game = (id: number, name: string) => ({
  id,
  name,
  coverId: null,
  year: 1991,
  platforms: ['SNES'],
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/games/filters', (route) =>
    route.fulfill({
      json: {
        platforms: [
          { id: 4, name: 'Nintendo 64' },
          { id: 19, name: 'Super Nintendo Entertainment System' },
          { id: 167, name: 'PlayStation 5' },
        ],
        genres: [
          { id: 31, name: 'Adventure' },
          { id: 12, name: 'Role-playing (RPG)' },
        ],
      },
    }),
  )
})

test('filters search with chips, kept in the URL', async ({ page }) => {
  const searches: Record<string, string>[] = []
  await page.route('**/api/games/search?**', async (route) => {
    const params = Object.fromEntries(
      new URL(route.request().url()).searchParams,
    )
    searches.push(params)
    const filtered = Object.keys(params).length > 1
    await route.fulfill({
      json: {
        games: filtered
          ? [game(1026, 'A Link to the Past')]
          : [game(1026, 'A Link to the Past'), game(1, 'Zelda II')],
        page: 1,
        hasMore: false,
      },
    })
  })

  await openSearch(page)
  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
  await expect(page.getByRole('heading', { name: 'Zelda II' })).toBeVisible()

  // The platform list is narrowed by typing.
  await page.getByRole('button', { name: 'Platform', exact: true }).click()
  await page.getByPlaceholder('Find a platform').fill('super')
  await expect(page.getByRole('option')).toHaveText([
    'Super Nintendo Entertainment System',
  ])
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', {
      name: 'Platform: Super Nintendo Entertainment System',
    }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Genre', exact: true }).click()
  await page.getByRole('option', { name: 'Adventure' }).click()

  await page.getByRole('button', { name: 'Release year', exact: true }).click()
  await page.getByRole('button', { name: '1990s' }).click()
  await expect(
    page.getByRole('button', { name: 'Release year: 1990s' }),
  ).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Zelda II' })).toBeHidden()
  await expect(page).toHaveURL(
    /\?q=zelda&platform=19&genre=31&from=1990&until=1999$/,
  )
  expect(searches.at(-1)).toEqual({
    q: 'zelda',
    platform: '19',
    genre: '31',
    from: '1990',
    until: '1999',
  })

  // Exact years, typed the wrong way round, are swapped.
  await page.getByRole('button', { name: 'Release year: 1990s' }).click()
  await page.getByLabel('From').fill('1995')
  await page.getByLabel('Until').fill('1991')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(
    page.getByRole('button', { name: 'Release year: 1991–1995' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Remove the Genre filter' }).click()
  await expect(page).toHaveURL(/\?q=zelda&platform=19&from=1991&until=1995$/)

  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByRole('heading', { name: 'Zelda II' })).toBeVisible()
  await expect(page).toHaveURL(/\?q=zelda$/)
})

test('a link brings its filters along', async ({ page }) => {
  await page.route('**/api/games/search?**', (route) =>
    route.fulfill({ json: { games: [], page: 1, hasMore: false } }),
  )
  await openSearch(page, '/?platform=4&from=2017')
  await expect(
    page.getByRole('button', { name: 'Platform: Nintendo 64' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Release year: From 2017' }),
  ).toBeVisible()
})

test('browses by filters alone, best-known games first', async ({ page }) => {
  const searches: Record<string, string>[] = []
  await page.route('**/api/games/search?**', async (route) => {
    searches.push(
      Object.fromEntries(new URL(route.request().url()).searchParams),
    )
    await route.fulfill({
      json: {
        games: [game(1026, 'A Link to the Past')],
        page: 1,
        hasMore: false,
      },
    })
  })
  await openSearch(page)
  await page.getByRole('button', { name: 'Platform', exact: true }).click()
  await page
    .getByRole('option', { name: 'Super Nintendo Entertainment System' })
    .click()

  await expect(
    page.getByRole('heading', { name: 'A Link to the Past' }),
  ).toBeVisible()
  await expect(
    page.getByText('The best-known games for these filters.', {
      exact: false,
    }),
  ).toBeVisible()
  expect(searches.at(-1)).toEqual({ platform: '19' })
  await expect(page).toHaveURL(/\/\?platform=19$/)
})

test('says so when a year is out of range', async ({ page }) => {
  await openSearch(page)
  await page.getByRole('button', { name: 'Release year', exact: true }).click()
  await page.getByLabel('From').fill('19')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Years go from 1950 to 2100.',
  )
  await expect(
    page.getByRole('button', { name: 'Release year', exact: true }),
  ).toBeVisible()
})
