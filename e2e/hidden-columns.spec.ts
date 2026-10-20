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
]

const header = (page: Page, name: string) =>
  page.getByRole('columnheader', { name })

async function openColumns(page: Page) {
  await page.getByRole('button', { name: 'Columns', exact: true }).click()
}

const toggleColumn = (page: Page, name: string) =>
  page.getByRole('checkbox', { name }).click()
const showAllColumns = (page: Page) =>
  page.getByRole('button', { name: 'Show all' }).click()

test.describe('in a collection', () => {
  const collectionId = '10000000-0000-4000-8000-000000000003'
  const entry = (n: number) => ({
    id: `30000000-0000-4000-8000-00000000000${n}`,
    igdbId: 100 + n,
    name: `Game ${n}`,
    coverId: null,
    year: 1990,
    genres: [],
    data: { status: 'Playing', score: 4 },
    addedAt: `2026-01-0${n}T00:00:00.000Z`,
  })

  async function open(page: Page, owner: boolean) {
    let hidden: string[] = []
    const saves: string[][] = []
    if (owner) await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
      route.fulfill({
        json: {
          id: collectionId,
          title: 'SNES Games',
          slug: 'snes-games',
          description: null,
          visibility: 'public',
          itemCount: 2,
          updatedAt: '2026-01-01T00:00:00.000Z',
          isOwner: owner,
          fields,
          hiddenColumns: hidden,
          dashboard: [],
          items: [entry(1), entry(2)],
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

  test('the owner hides columns, keeps them after a reload and shows all', async ({
    page,
  }) => {
    const saves = await open(page, true)
    await expect(header(page, 'Status')).toBeVisible()

    await openColumns(page)
    await toggleColumn(page, 'Status')
    await expect(header(page, 'Status')).toBeHidden()
    // The popover stays open for the next tick.
    await expect(page.getByRole('checkbox', { name: 'Score' })).toBeVisible()
    await toggleColumn(page, 'Added')
    await expect(header(page, 'Added')).toBeHidden()
    await expect(header(page, 'Score')).toBeVisible()
    expect(saves.at(-1)).toEqual(['status', 'addedAt'])
    // The name is not in the list.
    await expect(page.getByRole('checkbox', { name: 'Name' })).toHaveCount(0)

    await page.keyboard.press('Escape')
    await page.reload()
    await expect(header(page, 'Status')).toBeHidden()
    await expect(header(page, 'Name')).toBeVisible()

    await openColumns(page)
    await showAllColumns(page)
    await expect(header(page, 'Status')).toBeVisible()
    await expect(header(page, 'Added')).toBeVisible()
    expect(saves.at(-1)).toEqual([])
  })

  test('hiding the sorted column goes back to the default order', async ({
    page,
  }) => {
    await open(page, true)
    await header(page, 'Status').getByRole('button').click()
    await expect(header(page, 'Status')).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await openColumns(page)
    await toggleColumn(page, 'Status')
    await expect(
      page.getByRole('button', { name: 'Back to your order' }),
    ).toBeHidden()
  })

  test('puts a column back and says so when saving fails', async ({ page }) => {
    await open(page, true)
    await page.route(`**/api/collections/${collectionId}`, (route) =>
      route.fulfill({ status: 500, json: {} }),
    )
    await openColumns(page)
    await toggleColumn(page, 'Status')
    await expect(
      page.getByText("Couldn't save your columns. Try again."),
    ).toBeVisible()
    await expect(header(page, 'Status')).toBeVisible()
  })

  test('the page menu opens the fields editor', async ({ page }) => {
    await open(page, true)
    await page.getByRole('button', { name: 'Collection actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit fields' }).click()
    await expect(page.getByRole('dialog', { name: 'Fields' })).toBeVisible()
  })

  test('the page menu holds each page action once', async ({ page }) => {
    await open(page, true)
    await expect(page.getByRole('button', { name: 'Edit fields' })).toHaveCount(
      0,
    )
    await page.getByRole('button', { name: 'Collection actions' }).click()
    await expect(page.getByRole('menuitem')).toHaveText([
      'Edit details',
      'Edit fields',
      'Import CSV',
      'Export CSV',
      'Delete collection',
    ])
    await expect(page.getByText('extra fields per game')).toHaveCount(0)
    await expect(page.getByText(/^Columns:/)).toHaveCount(0)
  })

  test('visitors see the layout but get no columns button', async ({
    page,
  }) => {
    await open(page, false)
    await expect(
      page.getByRole('button', { name: 'Columns', exact: true }),
    ).toHaveCount(0)
  })
})

test.describe('on Owned', () => {
  const game = (i: number): FakeEntry => ({
    id: `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    igdbId: 1000 + i,
    name: `Game ${i}`,
    coverId: null,
    year: null,
    genres: [],
    addedAt: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
    data: { status: 'Playing' },
    owned: true,
    wishlisted: false,
    ownedOn: [],
    wantedOn: [],
    wanted: false,
    inCollections: [],
    platforms: ['Switch'],
  })

  async function open(page: Page) {
    await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/collections', (route) =>
      route.fulfill({ json: [] }),
    )
    await page.route('**/api/lists', (route) =>
      route.fulfill({ json: { owned: 3, wishlist: 0 } }),
    )
    const list = await fakeList(
      page,
      'retro_fan',
      'owned',
      [game(1), game(2), game(3)],
      { fields },
    )
    await page.goto('/u/retro_fan/shelf/owned')
    await expect(page.getByRole('table')).toBeVisible()
    return list
  }

  test('hides columns, keeps them after a reload and shows all', async ({
    page,
  }) => {
    const list = await open(page)
    await expect(header(page, 'Platforms')).toBeVisible()

    await openColumns(page)
    await toggleColumn(page, 'Platforms')
    await expect(header(page, 'Platforms')).toBeHidden()
    await toggleColumn(page, 'Status')
    await expect(header(page, 'Status')).toBeHidden()
    await expect(header(page, 'Collections')).toBeVisible()
    expect(list.columnSaves.at(-1)).toEqual(['platforms', 'status'])

    await page.keyboard.press('Escape')
    await page.reload()
    await expect(header(page, 'Platforms')).toBeHidden()
    await expect(header(page, 'Status')).toBeHidden()
    await expect(header(page, 'Score')).toBeVisible()

    await openColumns(page)
    await showAllColumns(page)
    await expect(header(page, 'Platforms')).toBeVisible()
    await expect(header(page, 'Status')).toBeVisible()
    expect(list.columnSaves.at(-1)).toEqual([])
  })

  test('hiding the sorted column asks the server for the default order', async ({
    page,
  }) => {
    const list = await open(page)
    await header(page, 'Platforms').getByRole('button').click()
    await expect(page).toHaveURL(/sort=platforms/)
    await openColumns(page)
    await toggleColumn(page, 'Platforms')
    await expect(page).not.toHaveURL(/sort=/)
    expect(list.requests.at(-1)!.searchParams.get('sort')).toBeNull()
  })
})
