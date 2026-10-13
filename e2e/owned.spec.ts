import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const zelda = {
  id: 'c1',
  title: 'Zelda Games',
  slug: 'zelda-games',
  color: '#22c55e',
}
const snes = { id: 'c2', title: 'SNES', slug: 'snes', color: null }
const owned = [
  {
    id: 'i1',
    igdbId: 1026,
    name: 'A Link to the Past',
    coverId: null,
    addedAt: '2026-05-02T10:00:00.000Z',
    collections: [snes, zelda],
  },
  {
    id: 'i2',
    igdbId: null,
    name: 'Homebrew Cart',
    coverId: null,
    addedAt: '2026-05-01T10:00:00.000Z',
    collections: [snes],
  },
]

test.beforeEach(async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
})

test('lists owned games with their collections, as a table or covers', async ({
  page,
}) => {
  await page.route('**/api/owned', (route) => route.fulfill({ json: owned }))
  await page.goto('/blueprints')
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Owned games' })
    .click()

  await expect(
    page.getByRole('heading', { level: 1, name: 'Owned games' }),
  ).toBeVisible()
  await expect(page.getByText('2 games')).toBeVisible()
  const rows = page.getByRole('row')
  await expect(rows).toHaveCount(3)
  await expect(
    page.getByRole('link', { name: 'A Link to the Past' }),
  ).toHaveAttribute('href', '/games/1026')
  await expect(
    rows.nth(1).getByRole('link', { name: 'Zelda Games' }),
  ).toHaveAttribute('href', '/u/retro_fan/shelf/zelda-games')
  // Added by hand, so there's no game page to link to.
  await expect(page.getByRole('link', { name: 'Homebrew Cart' })).toHaveCount(0)

  const search = page.getByRole('searchbox', {
    name: 'Search games and collections',
  })
  await search.fill('zelda')
  await expect(page.getByText('1 of 2 games')).toBeVisible()
  await expect(rows).toHaveCount(2)
  await search.fill('homebrew snes')
  await expect(page.getByRole('cell', { name: 'Homebrew Cart' })).toBeVisible()
  await search.fill('metroid')
  await expect(page.getByText('No games match “metroid”.')).toBeVisible()
  await search.fill('')

  await page.getByRole('button', { name: 'Covers' }).click()
  await expect(page.getByRole('table')).toBeHidden()
  await expect(
    page.getByRole('link', { name: 'A Link to the Past' }),
  ).toBeVisible()
})

test('explains an empty list', async ({ page }) => {
  await page.route('**/api/owned', (route) => route.fulfill({ json: [] }))
  await page.goto('/owned')
  await expect(page.getByText('No owned games yet')).toBeVisible()
})
