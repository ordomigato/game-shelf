import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collection = (
  title: string,
  pinnedPosition: number | null,
  extra: Record<string, unknown> = {},
) => ({
  id: crypto.randomUUID(),
  title,
  slug: title.toLowerCase().replaceAll(' ', '-'),
  description: null,
  visibility: 'private',
  itemCount: 3,
  updatedAt: '2026-05-01T00:00:00.000Z',
  pinnedPosition,
  ...extra,
})

const snes = collection('SNES Games', 1)
const nes = collection('NES Games', 2)
const atari = collection('Atari', null)

type PinRequest = { method: string; id: string; body: unknown }

async function openSidebar(page: Page, { failPins = false } = {}) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: [snes, nes, atari] }),
  )
  await page.route('**/api/blueprints', (route) => route.fulfill({ json: [] }))
  const requests: PinRequest[] = []
  await page.route('**/api/collections/*/pin', (route) => {
    const request = route.request()
    requests.push({
      method: request.method(),
      id: request.url().split('/').at(-2)!,
      body: request.postDataJSON(),
    })
    if (failPins) return route.fulfill({ status: 500, json: {} })
    if (request.method() === 'DELETE') return route.fulfill({ status: 204 })
    // Where the server would put it: first, or after the last pin.
    const first = request.postDataJSON()?.afterCollectionId === null
    return route.fulfill({ json: { position: first ? 0 : 9 } })
  })
  await page.goto('/blueprints')
  const sidebar = page.getByRole('complementary')
  return {
    requests,
    pinned: sidebar.getByRole('list', { name: 'Pinned' }),
    others: sidebar.getByRole('list', { name: 'Collections' }),
  }
}

test('pins a collection to the bottom of the pinned list', async ({ page }) => {
  const { requests, pinned, others } = await openSidebar(page)
  await others.getByRole('listitem').filter({ hasText: 'Atari' }).hover()
  await page.getByRole('button', { name: 'Pin Atari' }).click()

  await expect(pinned.getByRole('link')).toHaveText([
    'SNES Games',
    'NES Games',
    'Atari',
  ])
  await expect(others.getByRole('link')).toHaveCount(0)
  expect(requests).toEqual([{ method: 'PUT', id: atari.id, body: {} }])
})

test('unpins, and explains the empty pinned list', async ({ page }) => {
  const { requests, pinned, others } = await openSidebar(page)
  for (const name of ['SNES Games', 'NES Games']) {
    await pinned.getByRole('listitem').filter({ hasText: name }).hover()
    await page.getByRole('button', { name: `Unpin ${name}` }).click()
  }
  await expect(
    page.getByText('Pin collections to keep them here.'),
  ).toBeVisible()
  await expect(others.getByRole('link')).toHaveCount(3)
  expect(requests.map(({ method, id }) => [method, id])).toEqual([
    ['DELETE', snes.id],
    ['DELETE', nes.id],
  ])
})

test('the arrow keys move a pin up and down', async ({ page }) => {
  const { requests, pinned } = await openSidebar(page)
  const grip = page.getByRole('button', { name: /^Reorder NES Games/ })
  await grip.focus()
  await grip.press('ArrowUp')
  await expect(pinned.getByRole('link')).toHaveText(['NES Games', 'SNES Games'])
  await expect(grip).toBeFocused()
  expect(requests).toEqual([
    { method: 'PUT', id: nes.id, body: { afterCollectionId: null } },
  ])
})

test('a pin that fails to save is put back, with a message', async ({
  page,
}) => {
  const { pinned, others } = await openSidebar(page, { failPins: true })
  await others.getByRole('listitem').filter({ hasText: 'Atari' }).hover()
  await page.getByRole('button', { name: 'Pin Atari' }).click()
  await expect(page.getByText("Couldn't pin Atari. Try again.")).toBeVisible()
  await expect(pinned.getByRole('link')).toHaveText(['SNES Games', 'NES Games'])
  await expect(others.getByRole('link')).toHaveText(['Atari'])
})
