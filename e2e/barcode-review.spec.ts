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

type Status = 'pending' | 'approved' | 'rejected'

const group = (n: number, extra: Record<string, unknown> = {}) => ({
  key: `${ean(n)}:${n}:130`,
  code: ean(n),
  igdbId: n,
  platformId: 130,
  name: `Game ${n}`,
  coverId: null,
  platform: 'Nintendo Switch',
  status: 'pending' as Status,
  people: 1,
  users: ['retro_fan'],
  pickedAt: '2026-10-02T12:00:00.000Z',
  sent: false,
  scandex: null,
  disagrees: false,
  conflict: null,
  ...extra,
})

/** Signs in as an account that is, or isn't, the barcode reviewer. */
async function signIn(page: Page, reviewsBarcodes: boolean) {
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
        reviewsBarcodes,
      },
    }),
  )
}

interface Seen {
  lists: Status[]
  posts: { action: string; groups: { code: string }[] }[]
}

/**
 * Answers the review routes from the groups it is given. An action changes
 * their status, like the server does, and `answer` can change how it goes.
 */
async function stubReviews(
  page: Page,
  groups: ReturnType<typeof group>[],
  answer: (
    action: string,
    target: { code: string; igdbId: number; platformId: number },
  ) => Record<string, unknown> = () => ({}),
) {
  const seen: Seen = { lists: [], posts: [] }
  await page.route('**/api/barcodes/reviews**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Seen['posts'][number] & {
        groups: { code: string; igdbId: number; platformId: number }[]
      }
      seen.posts.push(body)
      return route.fulfill({
        json: body.groups.map((target) => ({
          ...target,
          result: 'done',
          ...answer(body.action, target),
        })),
      })
    }
    const status = new URL(request.url()).searchParams.get('status') as Status
    seen.lists.push(status)
    return route.fulfill({
      json: groups.filter((g) => g.status === status),
    })
  })
  return seen
}

const tabs = (page: Page) =>
  page.getByRole('navigation', { name: 'Account sections' })

test('the Barcodes tab is hidden from a normal account and its address is not found', async ({
  page,
}) => {
  await signIn(page, false)
  const seen = await stubReviews(page, [group(1)])
  await page.goto('/account')
  await expect(tabs(page).getByRole('link', { name: 'Usage' })).toBeVisible()
  await expect(tabs(page).getByRole('link', { name: 'Barcodes' })).toHaveCount(
    0,
  )

  await page.goto('/account/barcodes')
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible()
  await expect(page.getByTestId('barcodes-page')).toHaveCount(0)
  expect(seen.lists).toEqual([])
})

test('the reviewer sees the tab and the pending groups, with who picked and what ScanDex says', async ({
  page,
}) => {
  await signIn(page, true)
  await stubReviews(page, [
    group(1, {
      people: 3,
      users: ['ann', 'bob', 'cy'],
      scandex: { igdbId: 99, name: 'Something Else' },
      disagrees: true,
    }),
    group(2, { scandex: 'none' }),
    group(3, { conflict: { name: 'Other Game' } }),
  ])
  await page.goto('/account')
  await tabs(page).getByRole('link', { name: 'Barcodes' }).click()
  await expect(page).toHaveURL(/\/account\/barcodes$/)

  const rows = page.getByTestId('review-group')
  await expect(rows).toHaveCount(3)
  await expect(page.getByTestId('review-count')).toHaveText(
    '3 matches, 0 selected',
  )
  const first = rows.first()
  await expect(first).toContainText('Game 1')
  await expect(first).toContainText(`Nintendo Switch · ${ean(1)}`)
  await expect(first.getByTestId('group-people')).toHaveText('3 people')
  await expect(first).toContainText('ann, bob, cy')
  await expect(first.getByTestId('group-scandex')).toContainText(
    'ScanDex says: Something Else',
  )
  await expect(first.getByTestId('group-scandex')).toContainText(
    'This is a different game.',
  )
  await expect(rows.nth(1).getByTestId('group-scandex')).toHaveText(
    'ScanDex has no game for this box',
  )
  await expect(rows.nth(1).getByTestId('group-people')).toHaveText('1 person')
  const conflicting = rows.nth(2)
  await expect(conflicting.getByTestId('group-conflict')).toHaveText(
    'Another game is already approved for this barcode: Other Game',
  )
  await expect(
    conflicting.getByRole('button', { name: 'Approve', exact: true }),
  ).toBeDisabled()
  // Each pending group has three separate buttons.
  await expect(first.getByRole('button')).toHaveText([
    'Approve',
    'Approve and send to ScanDex',
    'Reject',
  ])
})

test('the filters show approved and rejected groups, with a Send button only for unsent approved ones', async ({
  page,
}) => {
  await signIn(page, true)
  const seen = await stubReviews(page, [
    group(1, { status: 'approved' }),
    group(2, { status: 'approved', sent: true }),
    group(3, { status: 'rejected' }),
  ])
  await page.goto('/account/barcodes')
  await expect(page.getByTestId('review-empty')).toHaveText(
    'Nothing is waiting for review.',
  )
  await expect(page.getByTestId('filter-pending')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByTestId('filter-approved').click()
  const rows = page.getByTestId('review-group')
  await expect(rows).toHaveCount(2)
  await expect(
    rows.first().getByRole('button', { name: 'Send to ScanDex' }),
  ).toBeVisible()
  await expect(rows.nth(1).getByTestId('group-sent')).toHaveText(
    'Sent to ScanDex',
  )
  await expect(rows.nth(1).getByRole('button')).toHaveCount(0)

  await page.getByTestId('filter-rejected').click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first().getByRole('button')).toHaveCount(0)
  expect(seen.lists).toEqual(['pending', 'approved', 'rejected'])
})

test('each filter has its own empty state', async ({ page }) => {
  await signIn(page, true)
  await stubReviews(page, [])
  await page.goto('/account/barcodes')
  await expect(page.getByTestId('review-empty')).toHaveText(
    'Nothing is waiting for review.',
  )
  await page.getByTestId('filter-approved').click()
  await expect(page.getByTestId('review-empty')).toHaveText(
    'No approved picks yet.',
  )
  await page.getByTestId('filter-rejected').click()
  await expect(page.getByTestId('review-empty')).toHaveText(
    'No rejected picks.',
  )
})

test('Approve, Approve and send, and Reject are three different requests', async ({
  page,
}) => {
  await signIn(page, true)
  const seen = await stubReviews(
    page,
    [group(1), group(2), group(3), group(4)],
    (action, target) =>
      action === 'approveAndSend' && target.igdbId === 4
        ? { send: { result: 'failed', status: 400, message: 'Not valid' } }
        : action === 'approveAndSend'
          ? { send: { result: 'sent' } }
          : {},
  )
  await page.goto('/account/barcodes')
  const rows = page.getByTestId('review-group')

  await rows
    .nth(0)
    .getByRole('button', { name: 'Approve', exact: true })
    .click()
  await expect(rows.nth(0).getByTestId('group-result')).toHaveText('Approved')

  await rows
    .nth(1)
    .getByRole('button', { name: 'Approve and send to ScanDex' })
    .click()
  await expect(rows.nth(1).getByTestId('group-result')).toHaveText(
    'Approved and sent to ScanDex',
  )

  await rows.nth(2).getByRole('button', { name: 'Reject' }).click()
  await expect(rows.nth(2).getByTestId('group-result')).toHaveText('Rejected')

  await rows
    .nth(3)
    .getByRole('button', { name: 'Approve and send to ScanDex' })
    .click()
  await expect(rows.nth(3).getByTestId('group-result')).toHaveText(
    "Couldn't send: Not valid",
  )
  // It stays approved, and can be sent again.
  await expect(
    rows.nth(3).getByRole('button', { name: 'Send to ScanDex' }),
  ).toBeVisible()

  expect(seen.posts.map((p) => p.action)).toEqual([
    'approve',
    'approveAndSend',
    'reject',
    'approveAndSend',
  ])
  expect(seen.posts.every((p) => p.groups.length === 1)).toBe(true)
})

test('approving a group marks the other game for the same barcode as conflicting', async ({
  page,
}) => {
  await signIn(page, true)
  const other = group(2, {
    code: ean(1),
    key: `${ean(1)}:2:130`,
    name: 'Game 2',
  })
  await stubReviews(page, [group(1), other])
  await page.goto('/account/barcodes')
  const rows = page.getByTestId('review-group')
  await expect(rows).toHaveCount(2)
  await rows
    .nth(0)
    .getByRole('button', { name: 'Approve', exact: true })
    .click()
  await expect(rows.nth(1).getByTestId('group-conflict')).toHaveText(
    'Another game is already approved for this barcode: Game 1',
  )
})

test('a conflict the server finds is told, and an approved group can be sent from its filter', async ({
  page,
}) => {
  await signIn(page, true)
  const seen = await stubReviews(
    page,
    [group(1, { status: 'approved' }), group(2)],
    (action) =>
      action === 'approve'
        ? { result: 'conflict' }
        : action === 'send'
          ? { send: { result: 'sent' } }
          : {},
  )
  await page.goto('/account/barcodes')
  await page
    .getByTestId('review-group')
    .getByRole('button', { name: 'Approve', exact: true })
    .click()
  await expect(page.getByTestId('group-result')).toHaveText(
    'Another game is already approved for this barcode.',
  )

  await page.getByTestId('filter-approved').click()
  await page.getByRole('button', { name: 'Send to ScanDex' }).click()
  await expect(page.getByTestId('group-result')).toHaveText('Sent to ScanDex')
  expect(seen.posts.map((p) => p.action)).toEqual(['approve', 'send'])
})

test('Select all and Clear change what the bulk buttons act on', async ({
  page,
}) => {
  await signIn(page, true)
  await stubReviews(page, [group(1), group(2), group(3)])
  await page.goto('/account/barcodes')
  await expect(
    page.getByRole('button', { name: 'Approve 0', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Select all' }).click()
  await expect(page.getByTestId('review-count')).toHaveText(
    '3 matches, 3 selected',
  )
  await expect(page.getByTestId('bulk-approve')).toHaveText('Approve 3')
  await expect(page.getByTestId('bulk-approve-send')).toHaveText(
    'Approve and send 3 to ScanDex',
  )
  await expect(page.getByTestId('bulk-reject')).toHaveText('Reject 3')
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.getByTestId('bulk-approve')).toBeDisabled()
  await page.getByLabel('Select Game 2').check()
  await expect(page.getByTestId('bulk-reject')).toHaveText('Reject 1')
})

test('45 groups are approved and sent in 3 rounds with progress, and only the failures say why', async ({
  page,
}) => {
  await signIn(page, true)
  const all = Array.from({ length: 45 }, (_, i) => group(i + 1))
  const rounds: number[] = []
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/barcodes/reviews**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const { groups } = request.postDataJSON() as {
        groups: { code: string; igdbId: number; platformId: number }[]
      }
      rounds.push(groups.length)
      // The last round waits, so the progress after round 2 can be seen.
      if (rounds.length === 3) await gate
      return route.fulfill({
        json: groups.map((target) => ({
          ...target,
          result: 'done',
          // Every 10th group fails to send.
          send:
            target.igdbId % 10 === 0
              ? { result: 'failed', status: 400, message: 'Not valid' }
              : { result: 'sent' },
        })),
      })
    }
    return route.fulfill({ json: all })
  })
  await page.goto('/account/barcodes')
  await expect(page.getByTestId('review-count')).toHaveText(
    '45 matches, 0 selected',
  )
  await page.getByRole('button', { name: 'Select all' }).click()
  await page
    .getByRole('button', { name: 'Approve and send 45 to ScanDex' })
    .click()
  await expect(page.getByTestId('review-progress')).toHaveText('Done 40 of 45')
  await expect(page.getByTestId('bulk-approve')).toBeDisabled()
  // Rounds 1 and 2 are done: groups 10, 20, 30 and 40 failed.
  await expect(
    page.getByTestId('group-result').filter({ hasText: "Couldn't send" }),
  ).toHaveCount(4)
  release()

  await expect(page.getByTestId('review-progress')).toHaveText('Done 45 of 45')
  await expect(
    page
      .getByTestId('group-result')
      .filter({ hasText: "Couldn't send: Not valid" }),
  ).toHaveCount(4)
  await expect(
    page
      .getByTestId('group-result')
      .filter({ hasText: 'Approved and sent to ScanDex' }),
  ).toHaveCount(41)
  expect(rounds).toEqual([20, 20, 5])
})

test('the tab says when the list cannot load, and retries', async ({
  page,
}) => {
  await signIn(page, true)
  let fail = true
  await page.route('**/api/barcodes/reviews**', (route) =>
    fail
      ? route.fulfill({ status: 500, json: {} })
      : route.fulfill({ json: [group(1)] }),
  )
  await page.goto('/account/barcodes')
  await expect(page.getByText("Couldn't load the picks.")).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByTestId('review-group')).toHaveCount(1)
})

test('the scanner no longer asks to share anything after an add', async ({
  page,
}) => {
  await signIn(page, true)
  const seen = await stubReviews(page, [group(1)])
  await page.route('**/api/barcodes/*', (route) => {
    const code = route.request().url().split('/').pop()!
    if (code.startsWith('reviews')) return route.fallback()
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

  await expect(page.getByText('Added 2 to Owned.')).toBeVisible()
  await expect(page.getByTestId('scanner')).toBeHidden()
  await expect(page.getByTestId('share')).toHaveCount(0)
  await expect(page.getByText(/Share .* with ScanDex/)).toHaveCount(0)
  expect(seen.lists).toEqual([])
})
