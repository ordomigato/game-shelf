import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collectionId = '10000000-0000-4000-8000-000000000051'
const fields = [
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: ['Backlog', 'Finished'],
  },
  { id: 'beaten', name: 'Beaten', type: 'checkbox' },
]

const summary = (id: number, name: string, year: number) => ({
  id,
  name,
  coverId: null,
  year,
  platforms: ['NES'],
})

async function openCollection(page: Page, matches: unknown[] = []) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/import/match', (route) => {
    const { names } = route.request().postDataJSON() as { names: string[] }
    return route.fulfill({
      json: names.map(
        (name) =>
          (matches as { name: string }[]).find(
            (match) => match.name === name,
          ) ?? {
            name,
            confidence: 'none',
            suggestion: null,
            candidates: [],
          },
      ),
    })
  })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/u/retro_fan/collections/nes-games', (route) =>
    route.fulfill({
      json: {
        id: collectionId,
        title: 'NES Games',
        slug: 'nes-games',
        description: null,
        visibility: 'private',
        itemCount: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
        isOwner: true,
        fields,
        items: [],
        dashboard: [],
      },
    }),
  )
  const sent: { fields?: unknown[]; rows: unknown[] }[] = []
  await page.route(`**/api/collections/${collectionId}/import`, (route) => {
    const body = route.request().postDataJSON() as (typeof sent)[number]
    sent.push(body)
    return route.fulfill({
      json: {
        added: body.rows.length,
        updated: 0,
        linked: 1,
        handAdded: body.rows.length - 1,
        rejectedValues: 0,
      },
    })
  })
  await page.goto('/u/retro_fan/shelf/nes-games')
  await page.getByRole('button', { name: 'Collection actions' }).click()
  await page.getByRole('menuitem', { name: 'Import CSV' }).click()
  return sent
}

async function chooseFile(page: Page, csv: string) {
  await page.getByLabel('Choose a CSV file').setInputFiles({
    name: 'games.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
}

test('imports a file, matching columns and reporting what does not fit', async ({
  page,
}) => {
  const sent = await openCollection(page)
  await chooseFile(
    page,
    '\uFEFFName,IGDB ID,Added,Status,Beaten,Price paid\r\n' +
      'The Legend of Zelda,1022,2026-01-01,finished,yes,$40\r\n' +
      'Micro Mages,,2026-02-01,Playing,maybe,$5\r\n',
  )
  const dialog = page.getByRole('dialog', { name: 'Import from a CSV file' })

  // Columns are matched from their names, with a new field for Price paid.
  await expect(
    dialog.getByRole('combobox', { name: 'Where Name goes' }),
  ).toHaveText('Game name')
  await expect(
    dialog.getByRole('combobox', { name: 'Where IGDB ID goes' }),
  ).toHaveText('IGDB ID')
  await expect(
    dialog.getByRole('combobox', { name: 'Where Added goes' }),
  ).toHaveText("Don't import")
  await expect(
    dialog.getByRole('combobox', { name: 'Where Status goes' }),
  ).toHaveText('Status')
  await expect(
    dialog.getByRole('combobox', {
      name: 'Type for the new field from Price paid',
    }),
  ).toHaveText('Amount')
  await dialog.getByRole('button', { name: 'Review' }).click()

  // The game without an IGDB ID is looked up by name, and not found.
  await expect(dialog.getByText('Not found on IGDB')).toBeVisible()
  await dialog.getByRole('button', { name: 'Review' }).click()

  await expect(dialog.getByText('2 games will be imported.')).toBeVisible()
  await expect(dialog.getByText('1 linked to IGDB')).toBeVisible()
  await expect(dialog.getByText('1 added by hand')).toBeVisible()
  await expect(dialog.getByText('New fields: Price paid')).toBeVisible()
  await expect(
    dialog.getByText('New choices for Status: Playing'),
  ).toBeVisible()
  await expect(dialog.getByRole('row', { name: /maybe/ })).toContainText(
    "Doesn't fit the field",
  )
  expect(sent).toHaveLength(0)

  await dialog.getByRole('button', { name: 'Import 2 games' }).click()
  await expect(dialog.getByText('Import finished')).toBeVisible()
  await expect(dialog.getByText('2 games added')).toBeVisible()

  expect(sent).toHaveLength(1)
  const [request] = sent
  const priceId = (request!.fields as { id: string; name: string }[]).find(
    (field) => field.name === 'Price paid',
  )!.id
  expect(request!.fields).toEqual([
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: ['Backlog', 'Finished', 'Playing'],
    },
    { id: 'beaten', name: 'Beaten', type: 'checkbox' },
    { id: priceId, name: 'Price paid', type: 'currency', currency: 'USD' },
  ])
  expect(request!.rows).toEqual([
    {
      name: 'The Legend of Zelda',
      igdbId: 1022,
      values: { status: 'Finished', beaten: true, [priceId]: 40 },
    },
    {
      name: 'Micro Mages',
      igdbId: null,
      values: { status: 'Playing', [priceId]: 5 },
    },
  ])
})

test('asks which column holds the name when it cannot tell', async ({
  page,
}) => {
  await openCollection(page)
  await chooseFile(page, 'Game Name Here,Status\r\nZelda,Finished\r\n')
  const dialog = page.getByRole('dialog', { name: 'Import from a CSV file' })
  await expect(
    dialog.getByText("Choose which column holds the game's name."),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Review' })).toBeDisabled()

  await dialog
    .getByRole('combobox', { name: 'Where Game Name Here goes' })
    .click()
  await page.getByRole('option', { name: 'Game name' }).click()
  await expect(dialog.getByRole('button', { name: 'Review' })).toBeEnabled()
})

test('explains an empty file', async ({ page }) => {
  await openCollection(page)
  await chooseFile(page, 'Name,Status\r\n')
  await expect(page.getByText('That file has no rows to import.')).toBeVisible()
})

test('matches games without an IGDB ID by name, for checking', async ({
  page,
}) => {
  const sent = await openCollection(page, [
    {
      name: 'super metroid',
      confidence: 'exact',
      suggestion: 1103,
      candidates: [summary(1103, 'Super Metroid', 1994)],
    },
    {
      name: 'zelda 1',
      confidence: 'close',
      suggestion: 1022,
      candidates: [
        summary(1022, 'The Legend of Zelda', 1986),
        summary(1025, 'Zelda II: The Adventure of Link', 1987),
      ],
    },
  ])
  await chooseFile(
    page,
    'Name,Status\r\nsuper metroid,Finished\r\nzelda 1,Backlog\r\n',
  )
  const dialog = page.getByRole('dialog', { name: 'Import from a CSV file' })
  await dialog.getByRole('button', { name: 'Review' }).click()

  // Exact matches are hidden by default: only the one to check shows.
  const toCheck = dialog.getByRole('combobox', { name: /^IGDB game for / })
  await expect(toCheck).toHaveCount(1)
  await expect(dialog.getByText('Closest match: check it')).toBeVisible()
  await dialog
    .getByRole('checkbox', { name: /Only show the ones to check/ })
    .click()
  await expect(toCheck).toHaveCount(2)

  await dialog.getByRole('combobox', { name: 'IGDB game for zelda 1' }).click()
  await page
    .getByRole('option', { name: 'Zelda II: The Adventure of Link (1987)' })
    .click()
  await dialog.getByRole('button', { name: 'Review' }).click()
  await expect(dialog.getByText('2 linked to IGDB')).toBeVisible()
  await dialog.getByRole('button', { name: 'Import 2 games' }).click()
  await expect(dialog.getByText('Import finished')).toBeVisible()

  // Matched games take their IGDB title and link.
  expect(sent[0]!.rows).toEqual([
    { name: 'Super Metroid', igdbId: 1103, values: { status: 'Finished' } },
    {
      name: 'Zelda II: The Adventure of Link',
      igdbId: 1025,
      values: { status: 'Backlog' },
    },
  ])
})

test('can skip matching and add them all by hand', async ({ page }) => {
  const sent = await openCollection(page, [
    {
      name: 'zelda 1',
      confidence: 'close',
      suggestion: 1022,
      candidates: [summary(1022, 'The Legend of Zelda', 1986)],
    },
  ])
  await chooseFile(page, 'Name\r\nzelda 1\r\n')
  const dialog = page.getByRole('dialog', { name: 'Import from a CSV file' })
  await dialog.getByRole('button', { name: 'Review' }).click()
  await dialog.getByRole('button', { name: 'Skip matching' }).click()
  await expect(dialog.getByText('1 added by hand')).toBeVisible()
  await dialog.getByRole('button', { name: 'Import 1 game' }).click()
  await expect(dialog.getByText('Import finished')).toBeVisible()
  expect(sent[0]!.rows).toEqual([{ name: 'zelda 1', igdbId: null, values: {} }])
})
