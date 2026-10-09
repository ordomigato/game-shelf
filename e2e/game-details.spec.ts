import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const linkToThePast = {
  id: 1026,
  name: 'The Legend of Zelda: A Link to the Past',
  coverId: null,
  releaseDate: '1991-11-21',
  summary: 'Venture back to Hyrule.',
  platforms: ['Super Nintendo Entertainment System', 'Wii'],
  genres: ['Puzzle', 'Adventure'],
  developers: ['Nintendo EAD'],
  publishers: ['Nintendo'],
  screenshotIds: ['shot1', 'shot2'],
  igdbUrl: 'https://www.igdb.com/games/the-legend-of-zelda-a-link-to-the-past',
}

async function openFromSearch(
  page: Page,
  details: { status?: number; body: unknown },
) {
  await page.route('**/api/games/search?**', (route) =>
    route.fulfill({
      json: {
        games: [
          {
            id: 1026,
            name: linkToThePast.name,
            coverId: null,
            year: 1991,
            platforms: ['SNES'],
          },
        ],
        page: 1,
        hasMore: false,
      },
    }),
  )
  await page.route('**/api/games/1026', (route) =>
    route.fulfill({ status: details.status ?? 200, json: details.body }),
  )
  await page.route('https://images.igdb.com/**', (route) =>
    route.fulfill({ status: 404 }),
  )
  await page.goto('/')
  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
  await page.getByRole('link', { name: linkToThePast.name }).click()
}

test('a search result opens the game page', async ({ page }) => {
  await openFromSearch(page, { body: linkToThePast })

  await expect(page).toHaveURL(/\/games\/1026$/)
  await expect(
    page.getByRole('heading', { level: 1, name: linkToThePast.name }),
  ).toBeVisible()
  await expect(page.getByText('Released November 21, 1991')).toBeVisible()
  await expect(page.getByText('Nintendo EAD')).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Genres' }).getByRole('listitem'),
  ).toHaveText(['Puzzle', 'Adventure'])
  await expect(page.getByText('Venture back to Hyrule.')).toBeVisible()
  await expect(page.getByRole('img', { name: /^Screenshot/ })).toHaveCount(2)
  await expect(page).toHaveTitle(`${linkToThePast.name} · GameShelf`)
})

test('the game page says its data comes from IGDB', async ({ page }) => {
  await openFromSearch(page, { body: linkToThePast })

  await expect(page.getByText('From IGDB')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'View this game on IGDB' }),
  ).toHaveAttribute('href', linkToThePast.igdbUrl)
})

test('back returns to the same search', async ({ page }) => {
  await openFromSearch(page, { body: linkToThePast })
  await expect(page).toHaveURL(/\/games\/1026$/)

  await page.getByRole('button', { name: 'Back' }).click()

  await expect(page).toHaveURL(/\?q=zelda$/)
  await expect(
    page.getByRole('searchbox', { name: 'Search games' }),
  ).toHaveValue('zelda')
})

test('a game IGDB does not have shows not found', async ({ page }) => {
  await openFromSearch(page, {
    status: 404,
    body: { statusMessage: 'Game not found' },
  })

  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible()
})
