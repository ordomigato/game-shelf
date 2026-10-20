import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collectionId = '10000000-0000-4000-8000-000000000041'

test('exports a collection as CSV from the table menu', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
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
        fields: [{ id: 'c', name: 'Condition', type: 'text' }],
        items: [
          {
            id: '30000000-0000-4000-8000-000000000410',
            igdbId: 1022,
            name: 'The Legend of Zelda',
            coverId: null,
            data: { c: 'Boxed' },
            addedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        dashboard: [],
      },
    }),
  )
  // Built in the browser from the games on the page: no request.
  let requested = false
  await page.route('**/export**', (route) => {
    requested = true
    return route.fulfill({ status: 404 })
  })
  await page.goto('/u/retro_fan/shelf/nes-games')
  await page.getByRole('button', { name: 'Collection actions' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export CSV' }).click()

  const file = await download
  expect(file.suggestedFilename()).toBe('nes-games.csv')
  expect(await readFile((await file.path())!, 'utf8')).toBe(
    '\uFEFFName,IGDB ID,Added,Condition\r\nThe Legend of Zelda,1022,2026-01-01,Boxed\r\n',
  )
  expect(requested).toBe(false)
})

test('exports everything from account settings', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  // The start of a zip file, enough to check the bytes arrive untouched.
  const zip = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...Array(18).fill(0)])
  await page.route('**/api/export', (route) =>
    route.fulfill({ body: zip, contentType: 'application/zip' }),
  )
  await page.goto('/account/settings')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export all your data' }).click()

  const file = await download
  expect(file.suggestedFilename()).toMatch(
    /^thisplayshelf-retro_fan-\d{4}-\d{2}-\d{2}\.zip$/,
  )
  expect(await readFile((await file.path())!)).toEqual(zip)
})

test('says so when an export fails', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/export', (route) =>
    route.fulfill({ status: 500, json: {} }),
  )
  await page.goto('/account/settings')
  await page.getByRole('button', { name: 'Export all your data' }).click()
  await expect(
    page.getByText("Couldn't prepare your download. Try again."),
  ).toBeVisible()
})

test('asks to wait after a few exports in a row', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/export', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'Retry-After': '300' },
      json: { statusMessage: 'Too many requests' },
    }),
  )
  await page.goto('/account/settings')
  await page.getByRole('button', { name: 'Export all your data' }).click()
  await expect(
    page.getByText("You've exported a few times just now."),
  ).toBeVisible()
})
