import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collectionId = '10000000-0000-4000-8000-000000000061'

const collectionOf = (itemCount: number) => ({
  id: collectionId,
  title: 'Final Fantasy',
  slug: 'final-fantasy',
  description: null,
  visibility: 'private',
  itemCount,
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const entry = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  igdbId: 1000 + i,
  name: `Game ${i}`,
  coverId: null,
  data: {},
  owned: true,
  wishlisted: false,
  ownedOn: [],
  wantedOn: [],
  addedAt: '2026-01-01T00:00:00.000Z',
  position: 'a',
  inCollections: [],
})

/** Opens the collection page for a collection holding `count` games. */
async function openCollection(
  page: Page,
  count: number,
  plan: 'free' | 'pro' = 'free',
) {
  await signInAs(page, { username: 'retro_fan' })
  if (plan === 'pro') {
    await page.route('**/api/me', (route) =>
      route.fulfill({
        json: {
          id: '00000000-0000-4000-8000-000000000002',
          username: 'retro_fan',
          displayName: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          plan,
        },
      }),
    )
  }
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: [collectionOf(count)] }),
  )
  await page.route('**/api/lists', (route) =>
    route.fulfill({ json: { owned: 0, wishlist: 0 } }),
  )
  await page.route('**/api/u/retro_fan/collections/final-fantasy', (route) =>
    route.fulfill({
      json: {
        ...collectionOf(count),
        isOwner: true,
        fields: [],
        items: Array.from({ length: Math.min(count, 5) }, (_, i) => entry(i)),
        dashboard: [],
      },
    }),
  )
  await page.goto('/u/retro_fan/shelf/final-fantasy')
}

test('a collection over the limit warns and stops adding', async ({ page }) => {
  await openCollection(page, 140)
  const alert = page.getByTestId('over-limit')
  await expect(alert).toContainText(
    'This collection has 140 games. Your plan allows 100 per collection.',
  )
  await expect(alert).toContainText(
    "You can keep and remove games, but you can't add more until it's down to 100.",
  )
  await expect(
    alert.getByRole('link', { name: 'Pro allows 1,000. See plans.' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add games' })).toBeDisabled()
})

test('the collection count has a separator in the thousands', async ({
  page,
}) => {
  await openCollection(page, 5, 'pro')
  await expect(page.getByText('5 of 1,000 games')).toBeVisible()
})

test('a collection with room has no warning', async ({ page }) => {
  await openCollection(page, 40)
  await expect(page.getByRole('link', { name: 'Add games' })).toBeVisible()
  await expect(page.getByTestId('over-limit')).toHaveCount(0)
})

test('a full collection shows as Full in the Add to menu', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  const open = { ...collectionOf(40), title: 'Open Shelf', slug: 'open-shelf' }
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: [collectionOf(100), open] }),
  )
  await page.route('**/api/lists', (route) =>
    route.fulfill({ json: { owned: 0, wishlist: 0 } }),
  )
  await page.route('**/api/library-items/igdb/**', (route) =>
    route.fulfill({ json: { item: null, collectionIds: [] } }),
  )
  await page.route('**/api/library-items/igdb?**', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/games/search?**', (route) =>
    route.fulfill({
      json: {
        games: [
          { id: 1, name: 'Zelda', coverId: null, year: 1986, platforms: [] },
        ],
        page: 1,
        hasMore: false,
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
  await page.getByRole('button', { name: 'Add to collection: Zelda' }).click()
  const full = page.getByRole('menuitemcheckbox', { name: /Final Fantasy/ })
  await expect(full).toBeDisabled()
  await expect(full).toContainText('Full')
  await expect(
    page.getByRole('menuitemcheckbox', { name: 'Open Shelf' }),
  ).toBeEnabled()
})

/** Opens a collection of `count` games and its import dialog. */
async function openImport(
  page: Page,
  count: number,
  plan: 'free' | 'pro' = 'free',
) {
  await openCollection(page, count, plan)
  await page.getByRole('button', { name: 'Collection actions' }).click()
  await page.getByRole('menuitem', { name: 'Import CSV' }).click()
}

const csvOf = (lines: string[]) => ({
  name: 'games.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(`Name,IGDB ID\n${lines.join('\n')}\n`),
})

test('the import dialog says how much room is left', async ({ page }) => {
  await openImport(page, 90)
  await expect(
    page.getByText('Room for 10 more games in this collection.'),
  ).toBeVisible()
})

test('an import that adds more new games than the room left is blocked at the preview', async ({
  page,
}) => {
  await page.route('**/api/import/match', (route) =>
    route.fulfill({
      json: (route.request().postDataJSON() as { names: string[] }).names.map(
        (name) => ({
          name,
          confidence: 'none',
          suggestion: null,
          candidates: [],
        }),
      ),
    }),
  )
  await openImport(page, 90)
  const rows = Array.from({ length: 340 }, (_, i) => `New ${i},`)
  await page.getByLabel('Choose a CSV file').setInputFiles(csvOf(rows))
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('button', { name: 'Skip matching' }).click()
  await expect(
    page.getByText(
      'This import adds 340 new games. This collection has room for 10.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /^Import/ })).toBeDisabled()
})

/** Match step stub: no names are matched to IGDB games. */
async function matchNothing(page: Page) {
  await page.route('**/api/import/match', (route) =>
    route.fulfill({
      json: (route.request().postDataJSON() as { names: string[] }).names.map(
        (name) => ({
          name,
          confidence: 'none',
          suggestion: null,
          candidates: [],
        }),
      ),
    }),
  )
}

async function toReview(page: Page) {
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('button', { name: 'Skip matching' }).click()
}

test('rows with the same title each need room, so two fit no better than one', async ({
  page,
}) => {
  await matchNothing(page)
  await openImport(page, 99)
  await page
    .getByLabel('Choose a CSV file')
    .setInputFiles(csvOf(['Same,', 'Same,']))
  await toReview(page)
  await expect(
    page.getByText(
      'This import adds 2 new games. This collection has room for 1.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /^Import/ })).toBeDisabled()
})

test('an import that would pass the library limit is blocked at the preview', async ({
  page,
}) => {
  await matchNothing(page)
  await page.route('**/api/me/usage', (route) =>
    route.fulfill({
      json: {
        plan: 'free',
        collections: 1,
        games: 2990,
        owned: 2000,
        wishlist: 990,
        fields: 0,
      },
    }),
  )
  await openImport(page, 0)
  const rows = Array.from({ length: 50 }, (_, i) => `New ${i},`)
  await page.getByLabel('Choose a CSV file').setInputFiles(csvOf(rows))
  await toReview(page)
  await expect(
    page.getByText('This import adds 50 new games. You can add 10 more.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /^Import/ })).toBeDisabled()
})

test('a refusal partway says how many rows were already imported', async ({
  page,
}) => {
  await matchNothing(page)
  await page.route('**/api/me/usage', (route) =>
    route.fulfill({
      json: {
        plan: 'pro',
        collections: 1,
        games: 0,
        owned: 0,
        wishlist: 0,
        fields: 0,
      },
    }),
  )
  let calls = 0
  await page.route(`**/api/collections/${collectionId}/import`, (route) => {
    calls++
    if (calls === 1) {
      return route.fulfill({
        json: { added: 250, updated: 0, linked: 0, handAdded: 250 },
      })
    }
    return route.fulfill({
      status: 403,
      json: {
        statusCode: 403,
        data: { key: 'limits.reached.games', params: { limit: 10000 } },
      },
    })
  })
  await openImport(page, 0, 'pro')
  const rows = Array.from({ length: 300 }, (_, i) => `New ${i},`)
  await page.getByLabel('Choose a CSV file').setInputFiles(csvOf(rows))
  await toReview(page)
  await page.getByRole('button', { name: /^Import 300/ }).click()
  await expect(
    page.getByText(
      'Imported 250 of 300 rows. Then: You can have up to 10000 games on your plan, owned or wishlisted.',
    ),
  ).toBeVisible()
})

test('a file that only updates games already there imports into a full collection', async ({
  page,
}) => {
  await openImport(page, 100)
  // Game 0 to Game 4 are on the page, with IGDB ids 1000 to 1004.
  await page
    .getByLabel('Choose a CSV file')
    .setInputFiles(csvOf(['Game 0,1000', 'Game 1,1001']))
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByText('This import adds')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Import/ })).toBeEnabled()
})

test('Pricing and Settings show the new numbers', async ({ page }) => {
  await page.goto('/pricing')
  const free = page.getByRole('region', { name: 'Free' })
  await expect(free.getByText('100 games per collection')).toBeVisible()
  await expect(free.getByText('3,000 games, owned or wishlisted')).toBeVisible()
  await expect(free.getByText('games on the Wishlist')).toHaveCount(0)
  const pro = page.getByRole('region', { name: 'Pro' })
  await expect(pro.getByText('1,000 games per collection')).toBeVisible()
  await expect(pro.getByText('10,000 games, owned or wishlisted')).toBeVisible()
})

test('Settings warns when the library is over the limit', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/me/usage', (route) =>
    route.fulfill({
      json: {
        plan: 'free',
        collections: 3,
        games: 3400,
        owned: 3390,
        wishlist: 10,
        fields: 2,
      },
    }),
  )
  await page.goto('/account/usage')
  await expect(
    page.getByText(
      'You have 3,400 games, owned or wishlisted. Your plan allows 3,000.',
    ),
  ).toBeVisible()
  await expect(
    page.getByText('Games: 3,400 of 3,000 (3,390 owned, 10 wishlisted)'),
  ).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Wishlist' })).toHaveCount(
    0,
  )
})
