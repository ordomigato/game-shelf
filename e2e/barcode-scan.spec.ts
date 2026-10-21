import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'
import { fakeList } from './support/lists'

const SWITCH = { id: 130, name: 'Switch' }

/** A real-looking EAN-13 for a number: 12 digits and their check digit. */
function ean(n: number): string {
  const body = `590${String(n).padStart(9, '0')}`
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3)
  return `${body}${(10 - (sum % 10)) % 10}`
}

const match = (igdbId: number, overrides: Record<string, unknown> = {}) => ({
  igdbId,
  name: `Game ${igdbId}`,
  coverId: null,
  releaseDate: '2017-03-03',
  platform: SWITCH,
  owned: false,
  wishlisted: false,
  ownedOn: [],
  wantedOn: [],
  ...overrides,
})

/** Answers the lookup route: barcode 1 is game 1, and so on. */
async function stubLookups(
  page: Page,
  answer: (n: number) => unknown = (n) => ({ match: match(n) }),
) {
  const asked: string[] = []
  await page.route('**/api/barcodes/*', (route) => {
    const code = route.request().url().split('/').pop()!
    asked.push(code)
    return route.fulfill({ json: answer(Number(code.slice(3, 12))) })
  })
  return asked
}

async function openOwnedScanner(page: Page) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await fakeList(page, 'retro_fan', 'owned', [])
  await page.goto('/u/retro_fan/shelf/owned')
  await openScanner(page)
}

/** Taps Scan, again if the page hadn't hydrated yet. */
async function openScanner(page: Page) {
  await expect(async () => {
    await page.getByRole('button', { name: 'Scan barcodes' }).click()
    await expect(page.getByTestId('scanner')).toBeVisible({ timeout: 1500 })
  }).toPass()
}

async function type(page: Page, code: string) {
  await page.getByLabel('Type the barcode').fill(code)
  await page.getByLabel('Type the barcode').press('Enter')
}

test('a typed barcode becomes a row, and ticked rows are added in one request', async ({
  page,
}) => {
  const asked = await stubLookups(page, (n) =>
    n === 3 ? { match: null } : { match: match(n) },
  )
  let bulkRequests = 0
  let body: unknown
  await page.route('**/api/library-items/bulk', (route) => {
    bulkRequests += 1
    body = route.request().postDataJSON()
    return route.fulfill({
      json: { added: 1, skipped: [], inCollection: 0 },
    })
  })
  await openOwnedScanner(page)

  // No camera in the test browser: the field is there with an explanation.
  await expect(page.getByTestId('camera-problem')).toBeVisible()

  await type(page, ean(1))
  await type(page, ean(2))
  await type(page, ean(3))
  await expect(page.getByTestId('scan-row')).toHaveCount(3)
  await expect(page.getByText('Game 1')).toBeVisible()
  await expect(page.getByText(`No match for ${ean(3)}`)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Add 2 to Owned' }),
  ).toBeEnabled()

  // The same barcode again doesn't add a row or ask again.
  await type(page, ean(1))
  await expect(page.getByTestId('scan-row')).toHaveCount(3)
  expect(asked).toHaveLength(3)

  await page.getByLabel('Add Game 2').click()
  await page.getByRole('button', { name: 'Add 1 to Owned' }).click()

  await expect(page.getByText('Added 1 to Owned.')).toBeVisible()
  await expect(page.getByTestId('scanner')).toBeHidden()
  expect(bulkRequests).toBe(1)
  expect(body).toEqual({
    list: 'owned',
    items: [{ igdbId: 1, platformId: 130 }],
  })
})

test('a barcode that is not real is refused before any lookup', async ({
  page,
}) => {
  const asked = await stubLookups(page)
  await openOwnedScanner(page)
  await type(page, '1234567890123')
  await expect(page.getByTestId('scan-problem')).toHaveText(
    "That isn't a barcode we can read. Check the numbers and try again.",
  )
  expect(asked).toEqual([])
})

test('games already owned there start unticked and can’t be added to the Wishlist', async ({
  page,
}) => {
  await stubLookups(page, (n) => ({
    match: match(n, { owned: true, ownedOn: [130] }),
  }))
  await openOwnedScanner(page)
  await type(page, ean(7))
  await expect(page.getByText('Already owned')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Add 0 to Owned' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Wishlist', pressed: false }).click()
  await expect(page.getByLabel('Add Game 7')).toBeDisabled()
})

test('a failed lookup says so and can be tried again', async ({ page }) => {
  let calls = 0
  await page.route('**/api/barcodes/*', (route) => {
    calls += 1
    return calls === 1
      ? route.fulfill({ status: 502, json: { statusMessage: 'Lookup failed' } })
      : route.fulfill({ json: { match: match(5) } })
  })
  await openOwnedScanner(page)
  await type(page, ean(5))
  await expect(page.getByText("Couldn't look this up")).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Game 5')).toBeVisible()
})

test('the list stops at 100 and says to add these first', async ({ page }) => {
  await stubLookups(page)
  let body: { items: unknown[] } | undefined
  await page.route('**/api/library-items/bulk', (route) => {
    body = route.request().postDataJSON() as { items: unknown[] }
    return route.fulfill({
      json: { added: 100, skipped: [], inCollection: 0 },
    })
  })
  await openOwnedScanner(page)
  for (let n = 1; n <= 100; n++) await type(page, ean(n))
  await expect(page.getByTestId('scan-row')).toHaveCount(100)
  await expect(
    page.getByRole('button', { name: 'Add 100 to Owned' }),
  ).toBeEnabled()

  await type(page, ean(101))
  await expect(page.getByTestId('scan-row')).toHaveCount(100)
  await expect(page.getByTestId('scan-problem')).toHaveText(
    'The list is full at 100 games. Add these first, then keep scanning.',
  )

  await page.getByRole('button', { name: 'Add 100 to Owned' }).click()
  await expect(page.getByText('Added 100 to Owned.')).toBeVisible()
  expect(body?.items).toHaveLength(100)
})

test('closing with scanned games asks first, and the list comes back', async ({
  page,
}) => {
  await stubLookups(page)
  await openOwnedScanner(page)
  await type(page, ean(1))
  await expect(page.getByText('Game 1')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Close the scanner?')).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByTestId('scanner')).toBeHidden()

  await page.getByRole('button', { name: 'Scan barcodes' }).click()
  await expect(page.getByText('Game 1')).toBeVisible()
})

test('a collection’s scanner also adds to the collection', async ({ page }) => {
  const collection = {
    id: '10000000-0000-4000-8000-000000000003',
    title: 'Zelda Games',
    slug: 'zelda-games',
    description: null,
    color: null,
    visibility: 'private',
    itemCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: [collection] }),
  )
  await page.route('**/api/u/retro_fan/collections/zelda-games', (route) =>
    route.fulfill({
      json: {
        ...collection,
        fields: [],
        items: [],
        dashboard: [],
        hiddenColumns: [],
        isOwner: true,
      },
    }),
  )
  await stubLookups(page)
  let body: unknown
  await page.route('**/api/library-items/bulk', (route) => {
    body = route.request().postDataJSON()
    return route.fulfill({
      json: { added: 1, skipped: [], inCollection: 1 },
    })
  })
  await page.goto('/u/retro_fan/shelf/zelda-games')
  await openScanner(page)
  await expect(page.getByLabel('Also add to Zelda Games')).toBeChecked()
  await type(page, ean(1))
  await page.getByRole('button', { name: 'Add 1 to Owned' }).click()
  await expect(
    page.getByText('Added 1 to Owned. 1 joined Zelda Games.'),
  ).toBeVisible()
  expect(body).toEqual({
    list: 'owned',
    collectionId: collection.id,
    items: [{ igdbId: 1, platformId: 130 }],
  })
})

test('a visitor who taps Scan is sent to sign in', async ({ page }) => {
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 401, json: { statusMessage: 'Sign in required' } }),
  )
  await page.goto('/')
  // A tap before the page has hydrated does nothing, so tap again.
  await expect(async () => {
    await page.getByRole('button', { name: 'Scan barcodes' }).click()
    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 1000 })
  }).toPass()
})
