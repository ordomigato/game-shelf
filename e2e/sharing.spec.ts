import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collection = {
  id: '10000000-0000-4000-8000-000000000021',
  title: 'NES Games',
  slug: 'nes-games',
  description: null,
  kind: 'custom',
  itemCount: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
  blueprint: {
    id: '20000000-0000-4000-8000-000000000021',
    name: null,
    shared: false,
    fields: [],
  },
  items: [],
}
const profile = {
  username: 'retro_fan',
  displayName: 'Retro Fan',
  memberSince: '2026-01-15T00:00:00.000Z',
}

async function openCollection(
  page: Page,
  { owner = true, visibility = 'private' } = {},
) {
  if (owner) await signInAs(page, { username: 'retro_fan' })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  let current = visibility
  await page.route('**/api/u/retro_fan/collections/nes-games', (route) =>
    route.fulfill({
      json: { ...collection, visibility: current, isOwner: owner },
    }),
  )
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  const patches: unknown[] = []
  await page.route(`**/api/collections/${collection.id}`, (route) => {
    const body = route.request().postDataJSON() as { visibility: string }
    patches.push(body)
    current = body.visibility
    return route.fulfill({
      json: { ...collection, visibility: current },
    })
  })
  await page.goto('/u/retro_fan/shelf/nes-games')
  await expect(page.getByRole('heading', { name: 'NES Games' })).toBeVisible()
  return patches
}

const clipboard = (page: Page) =>
  page.evaluate(() => navigator.clipboard.readText())

test('owners switch a collection between private and public', async ({
  page,
}) => {
  const patches = await openCollection(page)
  const menu = page.getByRole('button', { name: 'Who can see this: Private' })
  await menu.click()
  await page.getByRole('menuitem', { name: /Public/ }).click()
  await expect(
    page.getByRole('button', { name: 'Who can see this: Public' }),
  ).toBeVisible()
  await expect(page.getByText('Collection is now public')).toBeVisible()
  expect(patches).toEqual([{ visibility: 'public' }])
})

test('sharing a public collection copies its link', async ({ page }) => {
  await openCollection(page, { visibility: 'public' })
  await page.getByRole('button', { name: 'Share' }).click()
  await expect(page.getByText('Link copied')).toBeVisible()
  expect(await clipboard(page)).toMatch(/\/u\/retro_fan\/shelf\/nes-games$/)
})

test('sharing a private collection asks to make it public first', async ({
  page,
}) => {
  const patches = await openCollection(page)
  await page.getByRole('button', { name: 'Share' }).click()
  const dialog = page.getByRole('alertdialog', {
    name: 'Make it public to share?',
  })
  await dialog.getByRole('button', { name: 'Make public and share' }).click()
  await expect(page.getByText('Link copied')).toBeVisible()
  expect(patches).toEqual([{ visibility: 'public' }])
  expect(await clipboard(page)).toMatch(/\/shelf\/nes-games$/)
})

test('visitors can share a public collection but not change it', async ({
  page,
}) => {
  await openCollection(page, { owner: false, visibility: 'public' })
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Who can see this/ }),
  ).toHaveCount(0)
})

test('the shelf shows who it belongs to', async ({ page }) => {
  await page.route('**/api/u/retro_fan', (route) =>
    route.fulfill({ json: profile }),
  )
  await page.route('**/api/u/retro_fan/collections', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.goto('/u/retro_fan')
  await expect(page).toHaveURL(/\/u\/retro_fan\/shelf$/)
  await expect(
    page.getByRole('heading', { name: "Retro Fan's shelf" }),
  ).toBeVisible()
  await expect(
    page.getByText('@retro_fan · Member since January 2026'),
  ).toBeVisible()
})
