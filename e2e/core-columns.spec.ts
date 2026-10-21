import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { fakeList, type FakeEntry } from './support/lists'
import { signInAs } from './support/session'

const snes = { id: 19, name: 'SNES' }
const switchConsole = { id: 130, name: 'Switch' }

const header = (page: Page, name: string) =>
  page.getByRole('columnheader', { name })
const rowOf = (page: Page, name: string) =>
  page.getByRole('row').filter({ hasText: name })
const names = (page: Page) =>
  page
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          /Chrono Trigger|Zelda|Homebrew|Game \d/.exec(
            row.textContent ?? '',
          )?.[0] ?? '',
      ),
    )

async function openColumns(page: Page) {
  await page.getByRole('button', { name: 'Columns', exact: true }).click()
}

async function chooseGenre(page: Page, genre: string) {
  await page.getByRole('button', { name: 'Filter' }).click()
  await page.getByRole('menuitem', { name: 'Genre' }).click()
  await page.getByRole('menuitemcheckbox', { name: genre }).click()
  await page.keyboard.press('Escape')
}

const collectionId = '10000000-0000-4000-8000-000000000003'
const base = {
  coverId: null,
  data: {},
  owned: true,
  wishlisted: false,
  wanted: false,
  ownedOn: [] as number[],
  wantedOn: [] as number[],
}
const chrono = {
  ...base,
  id: '30000000-0000-4000-8000-000000000001',
  igdbId: 1070,
  name: 'Chrono Trigger',
  releaseDate: '1995-03-11',
  releasePrecision: 'day',
  genres: ['Role-playing (RPG)'],
  addedAt: '2026-01-01T00:00:00.000Z',
  ownedOn: [19],
  catalogPlatforms: [snes, switchConsole],
}
const zelda = {
  ...base,
  id: '30000000-0000-4000-8000-000000000002',
  igdbId: 1026,
  name: 'Zelda',
  releaseDate: '1991-10-01',
  releasePrecision: 'quarter',
  genres: ['Adventure', 'Puzzle'],
  addedAt: '2026-01-02T00:00:00.000Z',
  owned: false,
  wishlisted: true,
  wanted: true,
  wantedOn: [19],
  catalogPlatforms: [snes],
}
const homebrew = {
  ...base,
  id: '30000000-0000-4000-8000-000000000003',
  igdbId: null,
  name: 'Homebrew',
  releaseDate: null,
  releasePrecision: null,
  genres: [],
  addedAt: '2026-01-03T00:00:00.000Z',
  catalogPlatforms: [],
}

/**
 * What a visitor is sent: the platforms a game is owned and wanted on, with
 * their names, but not which lists it is on.
 */
const forVisitor = (item: typeof chrono) => {
  const { owned: _owned, wishlisted: _wishlisted, ...rest } = item
  const shown = [...item.ownedOn, ...item.wantedOn]
  return {
    ...rest,
    catalogPlatforms: item.catalogPlatforms.filter(({ id }) =>
      shown.includes(id),
    ),
  }
}

async function open(page: Page, owner: boolean) {
  let hidden: string[] = []
  const saves: string[][] = []
  if (owner) await signInAs(page, { username: 'retro_fan' })
  const items = [chrono, zelda, homebrew]
  await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
    route.fulfill({
      json: {
        id: collectionId,
        title: 'SNES Games',
        slug: 'snes-games',
        description: null,
        visibility: 'public',
        itemCount: 3,
        updatedAt: '2026-01-01T00:00:00.000Z',
        isOwner: owner,
        fields: [],
        hiddenColumns: hidden,
        dashboard: [],
        items: owner ? items : items.map(forVisitor),
      },
    }),
  )
  await page.route(`**/api/collections/${collectionId}`, (route) => {
    const body = route.request().postDataJSON() as { hiddenColumns: string[] }
    saves.push(body.hiddenColumns)
    hidden = body.hiddenColumns
    return route.fulfill({ json: {} })
  })
  await page.goto('/u/retro_fan/shelf/snes-games')
  await expect(page.getByRole('table')).toBeVisible()
  return saves
}

test.describe('a collection', () => {
  test('shows release date, genres and platforms to its owner', async ({
    page,
  }) => {
    await open(page, true)
    for (const name of ['Released', 'Genre', 'Platforms']) {
      await expect(header(page, name)).toBeVisible()
    }
    const chronoRow = rowOf(page, 'Chrono Trigger')
    await expect(chronoRow).toContainText('Mar 11, 1995')
    await expect(chronoRow).toContainText('Role-playing (RPG)')
    await expect(chronoRow.getByText('SNES')).toBeVisible()
    // A wishlisted platform is marked as such.
    await expect(
      rowOf(page, 'Zelda').getByTitle('SNES (Wishlist)'),
    ).toBeVisible()
    await expect(rowOf(page, 'Zelda')).toContainText('Adventure, Puzzle')
    // The date shows as exactly as IGDB knows it.
    await expect(rowOf(page, 'Zelda')).toContainText('Q4 1991')
  })

  test('hides and shows them from Columns', async ({ page }) => {
    const saves = await open(page, true)
    await openColumns(page)
    await page.getByRole('checkbox', { name: 'Released' }).click()
    await page.getByRole('checkbox', { name: 'Genre' }).click()
    await page.getByRole('checkbox', { name: 'Platforms' }).click()
    await expect(header(page, 'Released')).toBeHidden()
    await expect(header(page, 'Genre')).toBeHidden()
    await expect(header(page, 'Platforms')).toBeHidden()
    expect(saves.at(-1)).toEqual(['released', 'genre', 'platforms'])
    await page.getByRole('button', { name: 'Show all' }).click()
    await expect(header(page, 'Released')).toBeVisible()
    expect(saves.at(-1)).toEqual([])
  })

  test('sorts by release date, with games that have none last either way', async ({
    page,
  }) => {
    await open(page, true)
    const sort = header(page, 'Released').getByRole('button')
    await sort.click()
    expect(await names(page)).toEqual(['Zelda', 'Chrono Trigger', 'Homebrew'])
    await sort.click()
    expect(await names(page)).toEqual(['Chrono Trigger', 'Zelda', 'Homebrew'])
  })

  test('sorts by the first genre and filters by genre', async ({ page }) => {
    await open(page, true)
    await header(page, 'Genre').getByRole('button').click()
    expect(await names(page)).toEqual(['Zelda', 'Chrono Trigger', 'Homebrew'])

    // Any of the game's genres matches.
    await chooseGenre(page, 'Puzzle')
    expect(await names(page)).toEqual(['Zelda'])
    await page.getByRole('button', { name: 'Clear' }).click()
    expect(await names(page)).toHaveLength(3)
  })

  test('lets the owner pick the platforms from the cell', async ({ page }) => {
    await open(page, true)
    const sent: unknown[] = []
    await page.route('**/api/library-items/*/lists', (route) => {
      sent.push(route.request().postDataJSON())
      return route.fulfill({
        json: {
          item: {
            ...chrono,
            wishlisted: true,
            ownedOn: [19],
            wantedOn: [130],
          },
          collectionIds: [collectionId],
        },
      })
    })
    await page
      .getByRole('button', { name: 'Choose platforms for Chrono Trigger' })
      .click()
    const wished = page.getByRole('group', { name: 'Wishlisted on' })
    const owned = page.getByRole('group', { name: 'Owned on' })
    await expect(owned.getByRole('checkbox', { name: 'SNES' })).toBeChecked()
    await wished.getByRole('checkbox', { name: 'Switch' }).click()
    await expect
      .poll(() => sent)
      .toEqual([{ type: 'setWantedOn', platforms: [130] }])
    await expect(wished.getByRole('checkbox', { name: 'Switch' })).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(rowOf(page, 'Chrono Trigger')).toContainText('Switch')
  })

  test('moves a platform from one group to the other and undoes a failed save', async ({
    page,
  }) => {
    await open(page, true)
    await page.route('**/api/library-items/*/lists', (route) =>
      route.fulfill({ status: 500, json: {} }),
    )
    await page
      .getByRole('button', { name: 'Choose platforms for Chrono Trigger' })
      .click()
    const wished = page.getByRole('group', { name: 'Wishlisted on' })
    const owned = page.getByRole('group', { name: 'Owned on' })
    await wished.getByRole('checkbox', { name: 'SNES' }).click()
    await expect(page.getByText("Couldn't save the platforms")).toBeVisible()
    // Back as it was: owned on SNES, not wished.
    await expect(owned.getByRole('checkbox', { name: 'SNES' })).toBeChecked()
    await expect(
      wished.getByRole('checkbox', { name: 'SNES' }),
    ).not.toBeChecked()
  })

  test('has no platform picker for a game added by hand', async ({ page }) => {
    await open(page, true)
    await expect(
      page.getByRole('button', { name: 'Choose platforms for Homebrew' }),
    ).toHaveCount(0)
  })

  test('shows a visitor the release date, genres and platforms, read-only', async ({
    page,
  }) => {
    await open(page, false)
    await expect(header(page, 'Released')).toBeVisible()
    await expect(header(page, 'Genre')).toBeVisible()
    await expect(header(page, 'Platforms')).toBeVisible()
    await expect(rowOf(page, 'Zelda')).toContainText('Q4 1991')
    // Owned on SNES for Chrono Trigger, wanted on SNES for Zelda. The
    // Switch, which neither is on a list for, is not named.
    await expect(
      rowOf(page, 'Chrono Trigger').getByText('SNES', { exact: true }),
    ).toBeVisible()
    await expect(
      rowOf(page, 'Zelda').getByTitle('SNES (Wishlist)'),
    ).toBeVisible()
    await expect(page.getByText('Switch', { exact: true })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: /Choose platforms/ }),
    ).toHaveCount(0)
    await chooseGenre(page, 'Adventure')
    expect(await names(page)).toEqual(['Zelda'])
  })
})

test.describe('Owned', () => {
  const game = (
    i: number,
    releaseDate: string | null,
    releasePrecision: string | null,
    genres: string[],
  ): FakeEntry => ({
    id: `30000000-0000-4000-8000-00000000000${i}`,
    igdbId: 1000 + i,
    name: `Game ${i}`,
    coverId: null,
    releaseDate,
    releasePrecision,
    genres,
    addedAt: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
    data: {},
    owned: true,
    wishlisted: false,
    ownedOn: [],
    wantedOn: [],
    wanted: false,
    inCollections: [],
    platforms: ['SNES'],
  })

  async function open(page: Page) {
    await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/collections', (route) =>
      route.fulfill({ json: [] }),
    )
    await page.route('**/api/lists', (route) =>
      route.fulfill({ json: { owned: 3, wishlist: 0 } }),
    )
    const list = await fakeList(page, 'retro_fan', 'owned', [
      game(1, '1995-03-11', 'day', ['Role-playing (RPG)']),
      game(2, '1991-11-01', 'month', ['Adventure', 'Puzzle']),
      game(3, null, 'tbd', []),
    ])
    await page.goto('/u/retro_fan/shelf/owned')
    await expect(page.getByRole('table')).toBeVisible()
    return list
  }

  test('shows the same core columns and hides them from Columns', async ({
    page,
  }) => {
    const list = await open(page)
    for (const name of ['Released', 'Genre', 'Platforms']) {
      await expect(header(page, name)).toBeVisible()
    }
    await expect(rowOf(page, 'Game 2')).toContainText('Nov 1991')
    await expect(rowOf(page, 'Game 3')).toContainText('TBD')
    await expect(rowOf(page, 'Game 2')).toContainText('Adventure, Puzzle')

    await openColumns(page)
    await page.getByRole('checkbox', { name: 'Released' }).click()
    await expect(header(page, 'Released')).toBeHidden()
    expect(list.columnSaves.at(-1)).toEqual(['released'])
  })

  test('asks the server to sort by release date and genre', async ({
    page,
  }) => {
    const list = await open(page)
    await header(page, 'Released').getByRole('button').click()
    await expect(page).toHaveURL(/sort=released/)
    expect(await names(page)).toEqual(['Game 2', 'Game 1', 'Game 3'])
    await header(page, 'Genre').getByRole('button').click()
    await expect(page).toHaveURL(/sort=genre/)
    await expect
      .poll(() => list.requests.at(-1)!.searchParams.get('sort'))
      .toBe('genre')
    expect(await names(page)).toEqual(['Game 2', 'Game 1', 'Game 3'])
  })

  test('asks the server to filter by genre', async ({ page }) => {
    const list = await open(page)
    await chooseGenre(page, 'Puzzle')
    await expect(page).toHaveURL(/genre=Puzzle/)
    await expect
      .poll(() => list.requests.at(-1)!.searchParams.getAll('genre'))
      .toEqual(['Puzzle'])
    expect(await names(page)).toEqual(['Game 2'])
  })

  test('the platforms cell opens the same picker', async ({ page }) => {
    await open(page)
    await page
      .getByRole('button', { name: 'Choose platforms for Game 1' })
      .click()
    await expect(page.getByRole('group', { name: 'Owned on' })).toBeVisible()
    await expect(
      page.getByRole('group', { name: 'Wishlisted on' }),
    ).toBeVisible()
  })
})
