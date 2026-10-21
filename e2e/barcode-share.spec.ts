import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'
import { fakeList } from './support/lists'

/** A real-looking EAN-13 for a number: 12 digits and their check digit. */
function ean(n: number): string {
  const body = `590${String(n).padStart(9, '0')}`
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3)
  return `${body}${(10 - (sum % 10)) % 10}`
}

const suggestion = (n: number) => ({
  code: ean(n),
  igdbId: n,
  name: `Game ${n}`,
  coverId: null,
  platform: 'Nintendo Switch',
})

/** Signs in as an account that is, or isn't, allowed to share barcodes. */
async function signIn(page: Page, contributesBarcodes: boolean) {
  await signInAs(page, { username: 'retro_fan' })
  // Registered last, so it answers before the shared stub.
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        id: '00000000-0000-4000-8000-000000000002',
        username: 'retro_fan',
        displayName: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        plan: 'free',
        contributesBarcodes,
      },
    }),
  )
}

/** Lookups answer with the user's own match, and an add always works. */
async function stubScanner(page: Page) {
  await page.route('**/api/barcodes/*', (route) => {
    const code = route.request().url().split('/').pop()!
    const n = Number(code.slice(3, 12))
    return route.fulfill({
      json: {
        own: true,
        match: {
          igdbId: n,
          name: `Game ${n}`,
          coverId: null,
          releaseDate: null,
          platform: { id: 130, name: 'Switch' },
          owned: false,
          wishlisted: false,
          ownedOn: [],
          wantedOn: [],
        },
      },
    })
  })
  await page.route('**/api/library-items/bulk', (route) =>
    route.fulfill({ json: { added: 2, skipped: [], inCollection: 0 } }),
  )
}

/** Answers the suggestions routes and records what was asked. */
async function stubSuggestions(
  page: Page,
  list: unknown[],
  answer: unknown[] = [],
) {
  const seen = { lists: 0, sent: [] as string[][] }
  await page.route('**/api/barcodes/suggestions', (route) => {
    if (route.request().method() === 'POST') {
      seen.sent.push(
        (route.request().postDataJSON() as { codes: string[] }).codes,
      )
      return route.fulfill({ json: answer })
    }
    seen.lists += 1
    return route.fulfill({ json: list })
  })
  return seen
}

async function scanTwoAndAdd(page: Page) {
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await fakeList(page, 'retro_fan', 'owned', [])
  await page.goto('/u/retro_fan/shelf/owned')
  await expect(async () => {
    await page.getByRole('button', { name: 'Scan barcodes' }).click()
    await expect(page.getByTestId('scanner')).toBeVisible({ timeout: 1500 })
  }).toPass()
  for (const n of [1, 2]) {
    await page.getByLabel('Type the barcode').fill(ean(n))
    await page.getByLabel('Type the barcode').press('Enter')
  }
  await expect(page.getByTestId('scan-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Add 2 to Owned' }).click()
}

test('an allowed account is asked to share after an add, and Not now sends nothing', async ({
  page,
}) => {
  await signIn(page, true)
  await stubScanner(page)
  // A pick from another day is listed too, but isn't part of this batch.
  const seen = await stubSuggestions(page, [
    suggestion(1),
    suggestion(2),
    suggestion(9),
  ])
  await scanTwoAndAdd(page)

  await expect(
    page.getByRole('heading', { name: 'Share 2 new barcodes with ScanDex?' }),
  ).toBeVisible()
  await expect(page.getByTestId('share-row')).toHaveCount(2)
  await expect(page.getByTestId('share-row').first()).toContainText(
    `Nintendo Switch · ${ean(1)}`,
  )
  await expect(
    page.getByRole('button', { name: 'Send 2 to ScanDex' }),
  ).toBeEnabled()

  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(page.getByTestId('scanner')).toBeHidden()
  expect(seen.sent).toEqual([])
})

test('sending shows Sent or the reason for each, then Done closes', async ({
  page,
}) => {
  await signIn(page, true)
  await stubScanner(page)
  const seen = await stubSuggestions(
    page,
    [suggestion(1), suggestion(2)],
    [
      { code: ean(1), result: 'sent' },
      {
        code: ean(2),
        result: 'failed',
        status: 400,
        message: 'Value is not valid',
      },
    ],
  )
  await scanTwoAndAdd(page)

  await page.getByRole('button', { name: 'Send 2 to ScanDex' }).click()

  await expect(page.getByTestId('share-sent')).toHaveText('Sent')
  await expect(page.getByTestId('share-failed')).toHaveText(
    "Couldn't send: Value is not valid",
  )
  expect(seen.sent).toEqual([[ean(1), ean(2)]])

  await page.getByTestId('share-done').click()
  await expect(page.getByTestId('scanner')).toBeHidden()
})

test('an account that is not allowed never sees the share step or asks for picks', async ({
  page,
}) => {
  await signIn(page, false)
  await stubScanner(page)
  const seen = await stubSuggestions(page, [suggestion(1)])
  await scanTwoAndAdd(page)

  await expect(page.getByText('Added 2 to Owned.')).toBeVisible()
  await expect(page.getByTestId('scanner')).toBeHidden()
  await expect(page.getByTestId('share')).toHaveCount(0)
  expect(seen.lists).toBe(0)
})

test('Settings lists the picks to share, and says when there are none', async ({
  page,
}) => {
  await signIn(page, true)
  const seen = await stubSuggestions(
    page,
    [suggestion(3), suggestion(4)],
    [
      { code: ean(3), result: 'sent' },
      { code: ean(4), result: 'sent' },
    ],
  )
  await page.goto('/account/settings')

  await expect(
    page.getByRole('heading', { name: 'To share with ScanDex' }),
  ).toBeVisible()
  await expect(page.getByTestId('share-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Send 2 to ScanDex' }).click()
  await expect(page.getByTestId('share-sent')).toHaveCount(2)
  expect(seen.sent).toEqual([[ean(3), ean(4)]])

  // Done reloads the list, which is now empty.
  await page.unroute('**/api/barcodes/suggestions')
  await stubSuggestions(page, [])
  await page.getByTestId('share-done').click()
  await expect(page.getByText('Nothing to share right now.')).toBeVisible()
})

test('Settings has no share section for an account that is not allowed', async ({
  page,
}) => {
  await signIn(page, false)
  const seen = await stubSuggestions(page, [suggestion(3)])
  await page.goto('/account/settings')
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()
  await expect(page.getByTestId('share-settings')).toHaveCount(0)
  expect(seen.lists).toBe(0)
})
