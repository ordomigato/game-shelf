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

const sharedTab = (page: Page) =>
  page.getByRole('navigation', { name: 'Account sections' })

test('the ScanDex tab is hidden from a normal account and its address is not found', async ({
  page,
}) => {
  await signIn(page, false)
  const seen = await stubSuggestions(page, [suggestion(3)])
  await page.goto('/account')
  await expect(
    sharedTab(page).getByRole('link', { name: 'Usage' }),
  ).toBeVisible()
  await expect(
    sharedTab(page).getByRole('link', { name: 'ScanDex' }),
  ).toHaveCount(0)

  await page.goto('/account/scandex')
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible()
  await expect(page.getByTestId('scandex-page')).toHaveCount(0)
  expect(seen.lists).toBe(0)
})

test('an allowed account sees the ScanDex tab and its list', async ({
  page,
}) => {
  await signIn(page, true)
  await stubSuggestions(page, [suggestion(3), suggestion(4)])
  await page.goto('/account')
  await sharedTab(page).getByRole('link', { name: 'ScanDex' }).click()
  await expect(page).toHaveURL(/\/account\/scandex$/)
  await expect(page.getByTestId('share-count')).toHaveText('2 picks to share')
  await expect(page.getByTestId('share-row')).toHaveCount(2)
  await expect(page.getByTestId('share-row').first()).toContainText(
    `Nintendo Switch · ${ean(3)}`,
  )
})

test('Select all and Clear change what is sent', async ({ page }) => {
  await signIn(page, true)
  await stubSuggestions(page, [suggestion(1), suggestion(2), suggestion(3)])
  await page.goto('/account/scandex')
  await expect(
    page.getByRole('button', { name: 'Send 3 to ScanDex' }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(
    page.getByRole('button', { name: 'Send 0 to ScanDex' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Select all' }).click()
  await expect(
    page.getByRole('button', { name: 'Send 3 to ScanDex' }),
  ).toBeEnabled()
})

test('45 picks are sent in 3 rounds with progress, and only the failures stay', async ({
  page,
}) => {
  await signIn(page, true)
  const all = Array.from({ length: 45 }, (_, i) => suggestion(i + 1))
  // Every 10th pick fails.
  const fails = (code: string) => Number(code.slice(3, 12)) % 10 === 0
  const rounds: string[][] = []
  let sentAll = false
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/barcodes/suggestions', async (route) => {
    if (route.request().method() === 'POST') {
      const { codes } = route.request().postDataJSON() as { codes: string[] }
      rounds.push(codes)
      // The last round waits, so the progress after round 2 can be seen.
      if (rounds.length === 3) await gate
      if (rounds.length === 3) sentAll = true
      return route.fulfill({
        json: codes.map((code) =>
          fails(code)
            ? { code, result: 'failed', status: 400, message: 'Not valid' }
            : { code, result: 'sent' },
        ),
      })
    }
    return route.fulfill({
      json: sentAll ? all.filter((s) => fails(s.code)) : all,
    })
  })
  await page.goto('/account/scandex')
  await expect(page.getByTestId('share-count')).toHaveText('45 picks to share')

  await page.getByRole('button', { name: 'Send 45 to ScanDex' }).click()
  await expect(page.getByTestId('share-progress')).toHaveText('Sent 40 of 45')
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled()
  await expect(page.getByTestId('share-failed')).toHaveCount(4)
  release()

  // The list reloads: the 4 failed picks (10, 20, 30, 40) stay, ticked.
  await expect(page.getByTestId('share-count')).toHaveText('4 picks to share')
  await expect(page.getByTestId('share-row')).toHaveCount(4)
  await expect(page.getByTestId('share-failed').first()).toHaveText(
    "Couldn't send: Not valid",
  )
  await expect(
    page.getByRole('button', { name: 'Send 4 to ScanDex' }),
  ).toBeEnabled()
  expect(rounds.map((r) => r.length)).toEqual([20, 20, 5])
})

test('the ScanDex tab says when there is nothing to share, and offers a retry on an error', async ({
  page,
}) => {
  await signIn(page, true)
  let fail = true
  await page.route('**/api/barcodes/suggestions', (route) =>
    fail
      ? route.fulfill({ status: 500, json: {} })
      : route.fulfill({ json: [] }),
  )
  await page.goto('/account/scandex')
  await expect(page.getByText("Couldn't load your barcodes.")).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Nothing to share right now.')).toBeVisible()
})

test('Settings no longer has a share section', async ({ page }) => {
  await signIn(page, true)
  const seen = await stubSuggestions(page, [suggestion(3)])
  await page.goto('/account/settings')
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()
  await expect(page.getByText('To share with ScanDex')).toHaveCount(0)
  expect(seen.lists).toBe(0)
})
