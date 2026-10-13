import { expect, test } from './fixtures'

const game = (id: number, name: string) => ({
  id,
  name,
  coverId: null,
  year: 1991,
  platforms: ['SNES'],
})

test('filters search by platform, genre and years, kept in the URL', async ({
  page,
}) => {
  await page.route('**/api/games/filters', (route) =>
    route.fulfill({
      json: {
        platforms: [
          { id: 4, name: 'Nintendo 64' },
          { id: 19, name: 'Super Nintendo Entertainment System' },
        ],
        genres: [
          { id: 31, name: 'Adventure' },
          { id: 12, name: 'Role-playing (RPG)' },
        ],
      },
    }),
  )
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

  await page.goto('/')
  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
  await expect(page.getByRole('heading', { name: 'Zelda II' })).toBeVisible()

  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('combobox', { name: 'Platform' }).click()
  await page
    .getByRole('option', { name: 'Super Nintendo Entertainment System' })
    .click()
  await page.getByRole('combobox', { name: 'Genre' }).click()
  await page.getByRole('option', { name: 'Adventure' }).click()
  // Typed the wrong way round, so they're swapped.
  await page.getByLabel('From year').fill('1999')
  await page.getByLabel('To year').fill('1990')
  await page.getByLabel('To year').press('Enter')

  await expect(page.getByLabel('From year')).toHaveValue('1990')
  await expect(page.getByLabel('To year')).toHaveValue('1999')
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
  await expect(page.getByRole('button', { name: 'Filters (4)' })).toBeVisible()

  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByRole('heading', { name: 'Zelda II' })).toBeVisible()
  await expect(page).toHaveURL(/\?q=zelda$/)
})

test('ignores a year that is not one', async ({ page }) => {
  await page.route('**/api/games/filters', (route) =>
    route.fulfill({ json: { platforms: [], genres: [] } }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByLabel('From year').fill('19')
  await page.getByLabel('From year').press('Enter')
  await expect(page.getByLabel('From year')).toHaveValue('')
  await expect(
    page.getByRole('button', { name: 'Filters', exact: true }),
  ).toBeVisible()
})
