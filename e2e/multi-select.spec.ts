import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collectionId = '10000000-0000-4000-8000-000000000006'
const genres = {
  id: 'genres',
  name: 'Genres',
  type: 'multiselect',
  options: ['RPG', 'Action', 'Puzzle'],
}
const status = {
  id: 'status',
  name: 'Status',
  type: 'select',
  options: ['Backlog', 'Playing'],
}
const items = [
  {
    id: '30000000-0000-4000-8000-000000000041',
    igdbId: 601,
    name: 'Chrono Trigger',
    coverId: null,
    data: { genres: ['RPG'], status: 'Playing' },
    addedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '30000000-0000-4000-8000-000000000042',
    igdbId: 602,
    name: 'Tetris Attack',
    coverId: null,
    data: { genres: ['Action', 'Puzzle'], status: 'Backlog' },
    addedAt: '2026-01-02T00:00:00.000Z',
  },
]

async function open(page: Page, fields: unknown[] = [genres, status]) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
    route.fulfill({
      json: {
        id: collectionId,
        title: 'SNES Games',
        slug: 'snes-games',
        description: null,
        visibility: 'private',
        kind: 'custom',
        itemCount: items.length,
        updatedAt: '2026-01-01T00:00:00.000Z',
        isOwner: true,
        blueprint: {
          id: '20000000-0000-4000-8000-000000000006',
          name: null,
          shared: false,
          fields,
        },
        items,
      },
    }),
  )
  await page.goto('/u/retro_fan/shelf/snes-games')
  await expect(page.getByRole('table')).toBeVisible()
}

const names = (page: Page) =>
  page.getByRole('table').locator('tbody tr').getByRole('link')

test('ticks and unticks choices, saving each one', async ({ page }) => {
  const saved: unknown[] = []
  await page.route(`**/api/collections/${collectionId}/items/*`, (route) => {
    const { values } = route.request().postDataJSON() as {
      values: Record<string, unknown>
    }
    saved.push(values)
    return route.fulfill({
      json: { ...items[0], data: { ...items[0]!.data, ...values } },
    })
  })
  await open(page)

  const cell = page.getByRole('button', { name: /^Genres for Chrono Trigger/ })
  await expect(cell).toHaveAccessibleName('Genres for Chrono Trigger: RPG')
  await cell.click()
  await page.getByRole('menuitemcheckbox', { name: 'Puzzle' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'RPG' }).click()
  await page.keyboard.press('Escape')
  await expect(cell).toHaveAccessibleName('Genres for Chrono Trigger: Puzzle')

  expect(saved).toEqual([{ genres: ['RPG', 'Puzzle'] }, { genres: ['Puzzle'] }])
})

test('filters by any of the ticked choices', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Filter' }).click()
  await page.getByRole('menuitem', { name: 'Genres' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Puzzle' }).click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(names(page)).toHaveText(['Tetris Attack'])
})

test('a choice list can allow more than one choice, and back', async ({
  page,
}) => {
  const saved: { fields: { id: string; type: string }[] }[] = []
  await page.route(`**/api/collections/${collectionId}/fields`, (route) => {
    const body = route.request().postDataJSON() as (typeof saved)[number]
    saved.push(body)
    return route.fulfill({
      json: {
        id: '20000000-0000-4000-8000-000000000006',
        name: null,
        shared: false,
        fields: body.fields,
      },
    })
  })
  await open(page)
  await page.getByRole('button', { name: 'Edit fields' }).click()
  const dialog = page.getByRole('dialog', { name: 'Fields' })
  const checkboxes = dialog.getByRole('checkbox', {
    name: 'Allow more than one choice',
  })

  // Status: one choice to several keeps every value, so no question.
  await checkboxes.nth(1).click()
  // Genres: several to one would clear Tetris Attack's two genres.
  await checkboxes.nth(0).click()
  await dialog.getByRole('button', { name: 'Save fields' }).click()
  await expect(dialog.getByRole('alert').getByRole('listitem')).toHaveText([
    'Genres: deleted from 1 game',
  ])
  await dialog
    .getByRole('checkbox', {
      name: 'I understand these values will be deleted',
    })
    .click()
  await dialog.getByRole('button', { name: 'Delete values and save' }).click()
  await expect(dialog).toBeHidden()
  expect(saved[0]!.fields.map((field) => [field.id, field.type])).toEqual([
    ['genres', 'select'],
    ['status', 'multiselect'],
  ])
})
