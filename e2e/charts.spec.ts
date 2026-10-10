import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collectionId = '10000000-0000-4000-8000-000000000031'
const fields = [
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: ['Backlog', 'Playing', 'Finished'],
  },
  { id: 'price', name: 'Price paid', type: 'currency', currency: 'USD' },
]
const item = (n: number, data: Record<string, unknown>, addedAt: string) => ({
  id: `30000000-0000-4000-8000-0000000003${n}0`,
  igdbId: 900 + n,
  name: `Game ${n}`,
  coverId: null,
  data,
  addedAt,
})
const items = [
  item(1, { status: 'Finished', price: 40 }, '2026-01-10T00:00:00.000Z'),
  item(2, { status: 'Playing', price: 20 }, '2026-01-20T00:00:00.000Z'),
  item(3, { status: 'Finished' }, '2026-03-05T00:00:00.000Z'),
  item(4, {}, '2026-03-25T00:00:00.000Z'),
]

async function openCharts(
  page: Page,
  { owner = true, dashboard = [] as unknown[] } = {},
) {
  if (owner) await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  let current = dashboard
  await page.route('**/api/u/retro_fan/collections/nes-games', (route) =>
    route.fulfill({
      json: {
        id: collectionId,
        title: 'NES Games',
        slug: 'nes-games',
        description: null,
        visibility: 'public',
        kind: 'custom',
        itemCount: items.length,
        updatedAt: '2026-01-01T00:00:00.000Z',
        isOwner: owner,
        blueprint: {
          id: '20000000-0000-4000-8000-000000000031',
          name: null,
          shared: false,
          fields,
        },
        items,
        dashboard: current,
      },
    }),
  )
  const saves: unknown[][] = []
  await page.route(`**/api/collections/${collectionId}/dashboard`, (route) => {
    const body = route.request().postDataJSON() as { dashboard: unknown[] }
    saves.push(body.dashboard)
    current = body.dashboard
    return route.fulfill({ json: body.dashboard })
  })
  await page.goto('/u/retro_fan/shelf/nes-games?view=charts')
  return saves
}

const numberWidget = {
  id: 'w1',
  kind: 'number',
  title: '',
  size: 'small',
  measure: { op: 'sum', fieldId: 'price' },
}

test('adds a first number chart', async ({ page }) => {
  const saves = await openCharts(page)
  await expect(page.getByText('No charts yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Add your first chart' }).click()

  const dialog = page.getByRole('dialog', { name: 'Add a chart' })
  // The preview counts the games straight away.
  await expect(dialog.getByRole('region', { name: 'Games' })).toContainText('4')
  await dialog.getByRole('button', { name: 'Add chart' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByRole('region', { name: 'Games' })).toContainText('4')
  expect(saves).toHaveLength(1)
  expect(saves[0]).toEqual([
    {
      id: expect.any(String),
      kind: 'number',
      title: '',
      size: 'small',
      measure: { op: 'count' },
    },
  ])
})

test('builds a bar chart of games by a field', async ({ page }) => {
  const saves = await openCharts(page)
  await page.getByRole('button', { name: 'Add your first chart' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a chart' })
  await dialog.getByRole('button', { name: 'Bar' }).click()

  // Screen readers get the numbers behind the drawing.
  const preview = dialog.getByRole('region', { name: 'Games by Status' })
  await expect(preview.locator('figcaption')).toHaveText(
    'Playing: 1, Finished: 2, Not set: 1',
  )
  await dialog.getByRole('button', { name: 'Add chart' }).click()
  expect(saves[0]).toEqual([
    {
      id: expect.any(String),
      kind: 'bar',
      title: '',
      size: 'medium',
      measure: { op: 'count' },
      groupBy: 'status',
    },
  ])
})

test('totals an amount, and shows it with its currency', async ({ page }) => {
  await openCharts(page, { dashboard: [numberWidget] })
  await expect(
    page.getByRole('region', { name: 'Total Price paid' }),
  ).toContainText('$60.00')
})

test('a line chart fills in quiet months', async ({ page }) => {
  await openCharts(page, {
    dashboard: [
      {
        id: 'w2',
        kind: 'line',
        title: 'Collection growth',
        size: 'large',
        measure: { op: 'count' },
        timeline: { source: 'addedAt', bucket: 'month', cumulative: true },
      },
    ],
  })
  await expect(
    page
      .getByRole('region', { name: 'Collection growth' })
      .locator('figcaption'),
  ).toHaveText('Jan 2026: 2, Feb 2026: 2, Mar 2026: 4')
})

test('resizes and removes a chart', async ({ page }) => {
  const saves = await openCharts(page, { dashboard: [numberWidget] })
  const actions = page.getByRole('button', {
    name: 'Actions for Total Price paid',
  })
  await actions.click()
  await page.getByRole('menuitem', { name: 'Size' }).click()
  await page.getByRole('menuitemradio', { name: 'Wide' }).click()
  await expect.poll(() => saves.length).toBe(1)
  expect(saves[0]).toEqual([{ ...numberWidget, size: 'large' }])

  await actions.click()
  await page.getByRole('menuitem', { name: 'Remove chart' }).click()
  await expect(page.getByText('No charts yet.')).toBeVisible()
  expect(saves[1]).toEqual([])
})

test('a chart whose field was removed says so', async ({ page }) => {
  await openCharts(page, {
    dashboard: [
      {
        ...numberWidget,
        title: 'Spend',
        measure: { op: 'sum', fieldId: 'gone' },
      },
    ],
  })
  await expect(page.getByRole('region', { name: 'Spend' })).toContainText(
    'This chart uses a field that was removed or changed.',
  )
})

test('visitors see the charts but cannot change them', async ({ page }) => {
  await openCharts(page, { owner: false, dashboard: [numberWidget] })
  await expect(
    page.getByRole('region', { name: 'Total Price paid' }),
  ).toContainText('$60.00')
  await expect(page.getByRole('button', { name: 'Add chart' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Actions for/ })).toHaveCount(0)
})

test('the charts view has its own link', async ({ page }) => {
  await openCharts(page)
  await page.getByRole('button', { name: 'Table' }).click()
  await expect(page).not.toHaveURL(/view=charts/)
  await page.getByRole('button', { name: 'Charts' }).click()
  await expect(page).toHaveURL(/view=charts/)
})

test('suggests charts for an empty dashboard', async ({ page }) => {
  const saves = await openCharts(page)
  const suggested = page
    .getByText('Suggested for this collection')
    .locator('..')
  await expect(suggested.getByRole('listitem')).toHaveText([
    /Games/,
    /Total Price paid/,
    /Games by Status/,
    /Games over time/,
  ])
  await suggested.getByRole('button', { name: 'Add all 4' }).click()
  await expect(
    page.getByRole('region', { name: 'Games by Status' }),
  ).toBeVisible()
  expect(saves[0]!.map((w) => (w as { kind: string }).kind)).toEqual([
    'number',
    'number',
    'pie',
    'line',
  ])
})

test('offers the rest as suggestions once there are charts', async ({
  page,
}) => {
  const saves = await openCharts(page, { dashboard: [numberWidget] })
  await page.getByRole('button', { name: 'Suggestions' }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Suggested for this collection',
  })
  // The total spent is already there, so it isn't suggested again.
  await expect(dialog.getByText('Total Price paid')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Add Games by Status' }).click()
  await expect(dialog).toBeHidden()
  expect(saves[0]).toEqual([
    numberWidget,
    {
      id: expect.any(String),
      kind: 'pie',
      title: '',
      size: 'small',
      measure: { op: 'count' },
      groupBy: 'status',
    },
  ])
})
