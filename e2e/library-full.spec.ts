import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'
import { fakeList } from './support/lists'

// The free plan holds 3,000 games, owned or wishlisted.
const FULL = { owned: 2990, wishlist: 10, library: 3000 }
const itemId = '33333333-3333-4333-8333-333333333333'

const games = [1, 2].map((id) => ({
  id,
  name: `Zelda Game ${id}`,
  coverId: null,
  year: 1986,
  platforms: ['NES'],
}))

async function signedInWithFullLibrary(page: Page) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/lists', (route) => route.fulfill({ json: FULL }))
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/games/search?**', (route) =>
    route.fulfill({ json: { games, page: 1, hasMore: false } }),
  )
}

test('Owned stops offering to add games when the library is full', async ({
  page,
}) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/lists', (route) => route.fulfill({ json: FULL }))
  await fakeList(page, 'retro_fan', 'owned', [], { libraryCount: 3000 })
  await page.goto('/u/retro_fan/shelf/owned')
  await expect(page.getByTestId('library-full')).toHaveText(
    'Your library is full. Remove a game to add another.',
  )
  await expect(page.getByRole('button', { name: 'Add games' })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Add games' })).toHaveCount(0)
})

test('Owned offers it while there is room', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await fakeList(page, 'retro_fan', 'owned', [], { libraryCount: 2999 })
  await page.goto('/u/retro_fan/shelf/owned')
  await expect(page.getByRole('link', { name: 'Add games' })).toBeVisible()
  await expect(page.getByTestId('library-full')).toHaveCount(0)
})

test('the Add to menu says Full for a new game, and still moves one the library has', async ({
  page,
}) => {
  await signedInWithFullLibrary(page)
  await page.route('**/api/library-items/igdb?**', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/library-items/igdb/1', (route) =>
    route.fulfill({ json: { item: null, collectionIds: [], platforms: [] } }),
  )
  await page.route('**/api/library-items/igdb/2', (route) =>
    route.fulfill({
      json: {
        item: {
          id: itemId,
          igdbId: 2,
          name: 'Zelda Game 2',
          coverId: null,
          releaseDate: null,
          releasePrecision: null,
          genres: [],
          data: {},
          owned: true,
          wishlisted: false,
          ownedOn: [],
          wantedOn: [],
        },
        collectionIds: [],
        platforms: [],
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')

  await page
    .getByRole('button', { name: 'Add to collection: Zelda Game 1' })
    .click()
  for (const name of ['Owned', 'Wishlist']) {
    const box = page.getByRole('menuitemcheckbox', { name })
    await expect(box).toBeDisabled()
    await expect(box).toContainText('Full')
  }
  await page.keyboard.press('Escape')

  // A game the library already has takes no new room.
  await page
    .getByRole('button', { name: 'Add to collection: Zelda Game 2' })
    .click()
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Wishlist' }),
  ).toBeEnabled()
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Wishlist' }),
  ).not.toContainText('Full')
})

test('searching for a list disables adding a game the library lacks', async ({
  page,
}) => {
  await signedInWithFullLibrary(page)
  await page.route('**/api/library-items/igdb?**', (route) => {
    const query = new URL(route.request().url()).searchParams
    // Asked without a list, it says which results the library has.
    return route.fulfill({
      json: query.get('list') ? [] : [{ igdbId: 2, itemId }],
    })
  })
  await page.goto('/?to=owned')
  await expect(page.getByText('Adding to Owned')).toBeVisible()
  await expect(
    page.getByText(
      'Your library is full. Only games you already have can be added.',
    ),
  ).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
  await expect(
    page.getByRole('button', { name: 'Add Zelda Game 1 to Owned' }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Add Zelda Game 2 to Owned' }),
  ).toBeEnabled()
})
