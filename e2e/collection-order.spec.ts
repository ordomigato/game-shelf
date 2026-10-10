import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collectionId = '10000000-0000-4000-8000-000000000004'
const items = [
  'Chrono Trigger',
  'EarthBound',
  'Mega Man 2',
  'Secret of Mana',
].map((name, i) => ({
  id: `30000000-0000-4000-8000-00000000001${i}`,
  igdbId: 200 + i,
  name,
  coverId: null,
  data: { hours: [30, 9, 100, 12][i] },
  addedAt: `2026-01-0${i + 1}T00:00:00.000Z`,
}))
const idOf = (name: string) => items.find((item) => item.name === name)!.id

async function open(
  page: Page,
  options: { owner?: boolean; moveStatus?: number } = {},
) {
  const { owner = true, moveStatus = 204 } = options
  if (owner) await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
    route.fulfill({
      json: {
        id: collectionId,
        title: 'SNES Games',
        slug: 'snes-games',
        description: null,
        visibility: 'public',
        kind: 'custom',
        itemCount: items.length,
        updatedAt: '2026-01-01T00:00:00.000Z',
        isOwner: owner,
        blueprint: {
          id: '20000000-0000-4000-8000-000000000004',
          name: null,
          shared: false,
          fields: [{ id: 'hours', name: 'Hours played', type: 'number' }],
        },
        items,
      },
    }),
  )
  const moves: { itemId: string; afterItemId: string | null }[] = []
  await page.route(
    `**/api/collections/${collectionId}/items/*/position`,
    (route) => {
      const itemId = route.request().url().split('/').at(-2)!
      const { afterItemId } = route.request().postDataJSON() as {
        afterItemId: string | null
      }
      moves.push({ itemId, afterItemId })
      return route.fulfill({ status: moveStatus })
    },
  )
  await page.goto('/u/retro_fan/shelf/snes-games')
  await expect(page.getByRole('table')).toBeVisible()
  return moves
}

const names = (page: Page) =>
  page.getByRole('table').locator('tbody tr').getByRole('link')

async function menuMove(page: Page, name: string, action: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: action }).click()
}

test('owners move games from the row menu', async ({ page }) => {
  const moves = await open(page)

  await menuMove(page, 'Chrono Trigger', 'Move to bottom')
  await expect(names(page)).toHaveText([
    'EarthBound',
    'Mega Man 2',
    'Secret of Mana',
    'Chrono Trigger',
  ])

  await menuMove(page, 'Mega Man 2', 'Move up')
  await expect(names(page)).toHaveText([
    'Mega Man 2',
    'EarthBound',
    'Secret of Mana',
    'Chrono Trigger',
  ])

  await menuMove(page, 'Secret of Mana', 'Move to top')
  await expect(names(page).first()).toHaveText('Secret of Mana')

  expect(moves).toEqual([
    { itemId: idOf('Chrono Trigger'), afterItemId: idOf('Secret of Mana') },
    { itemId: idOf('Mega Man 2'), afterItemId: null },
    { itemId: idOf('Secret of Mana'), afterItemId: null },
  ])

  // The first game can't go further up.
  await page.getByRole('button', { name: 'Actions for Secret of Mana' }).click()
  await expect(page.getByRole('menuitem', { name: 'Move up' })).toBeDisabled()
})

test('owners drag a game into place', async ({ page }) => {
  const moves = await open(page)
  const rows = page.getByRole('table').locator('tbody tr')
  const handle = rows.nth(0).locator('.drag-handle')
  const target = rows.nth(2)

  const from = (await handle.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, {
    steps: 12,
  })
  await page.mouse.move(from.x + from.width / 2, to.y + to.height * 0.8, {
    steps: 4,
  })
  await page.mouse.up()

  // Exactly where a simulated drop lands depends on pixels, so check that
  // the game moved down and that what was saved matches what's shown.
  await expect(names(page).first()).not.toHaveText('Chrono Trigger')
  const shown = await names(page).allTextContents()
  const at = shown.indexOf('Chrono Trigger')
  expect(at).toBeGreaterThan(0)
  expect(moves).toEqual([
    { itemId: idOf('Chrono Trigger'), afterItemId: idOf(shown[at - 1]!) },
  ])
})

test('reordering pauses while the table is sorted', async ({ page }) => {
  await open(page)
  await expect(page.locator('.drag-handle')).toHaveCount(4)

  await page.getByRole('button', { name: 'Hours played', exact: true }).click()
  await expect(page.locator('.drag-handle')).toHaveCount(0)
  await page.getByRole('button', { name: 'Actions for EarthBound' }).click()
  await expect(page.getByRole('menuitem', { name: 'Move up' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Back to your order' }).click()
  await expect(names(page).first()).toHaveText('Chrono Trigger')
  await expect(page.locator('.drag-handle')).toHaveCount(4)
})

test('a failed move is undone with a message', async ({ page }) => {
  await open(page, { moveStatus: 500 })
  await menuMove(page, 'Chrono Trigger', 'Move down')
  await expect(
    page.getByText("Couldn't move that game. Try again."),
  ).toBeVisible()
  await expect(names(page)).toHaveText([
    'Chrono Trigger',
    'EarthBound',
    'Mega Man 2',
    'Secret of Mana',
  ])
})

test('visitors see the order but cannot change it', async ({ page }) => {
  await open(page, { owner: false })
  await expect(names(page).first()).toHaveText('Chrono Trigger')
  await expect(page.locator('.drag-handle')).toHaveCount(0)
})
