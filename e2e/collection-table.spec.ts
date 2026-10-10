import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collectionId = '10000000-0000-4000-8000-000000000003'
const item = (n: number, name: string, data: Record<string, unknown>) => ({
  id: `30000000-0000-4000-8000-00000000000${n}`,
  igdbId: 100 + n,
  name,
  coverId: null,
  data,
  addedAt: `2026-01-0${n}T00:00:00.000Z`,
})
const items = [
  item(1, 'Chrono Trigger', {
    status: 'Finished',
    hours: 30,
    rating: 5,
    done: true,
  }),
  item(2, 'EarthBound', { status: 'Playing', hours: 9 }),
  item(3, 'Mega Man 2', { status: 'Backlog', hours: 100, notes: 'Hard mode' }),
]
const detail = (isOwner: boolean) => ({
  id: collectionId,
  title: 'SNES Games',
  slug: 'snes-games',
  description: null,
  visibility: 'public',
  kind: 'custom',
  itemCount: items.length,
  updatedAt: '2026-01-01T00:00:00.000Z',
  isOwner,
  blueprint: {
    id: '20000000-0000-4000-8000-000000000003',
    name: null,
    shared: false,
    fields: [
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        options: ['Backlog', 'Playing', 'Finished'],
      },
      { id: 'hours', name: 'Hours played', type: 'number' },
      { id: 'rating', name: 'Rating', type: 'rating' },
      { id: 'done', name: 'Beaten', type: 'checkbox' },
      { id: 'notes', name: 'Notes', type: 'text' },
    ],
  },
  items,
})

async function openCollection(page: Page, owner: boolean) {
  if (owner) await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
    route.fulfill({ json: detail(owner) }),
  )
  await page.goto('/u/retro_fan/shelf/snes-games')
  await expect(page.getByRole('table')).toBeVisible()
}

/** Game names in the order the table shows them. */
const names = (page: Page) =>
  page.getByRole('table').locator('tbody tr').getByRole('link')

test.describe('visitors', () => {
  test('see the fields as columns and can sort by any of them', async ({
    page,
  }) => {
    await openCollection(page, false)
    await expect(page.getByRole('columnheader')).toHaveText([
      'Name',
      'Status',
      'Hours played',
      'Rating',
      'Beaten',
      'Notes',
      'Added',
    ])
    await expect(names(page)).toHaveText([
      'Chrono Trigger',
      'EarthBound',
      'Mega Man 2',
    ])

    // Numbers sort as numbers, largest first: 100, 30, 9.
    await page.getByRole('button', { name: 'Hours played' }).click()
    await expect(names(page)).toHaveText([
      'Mega Man 2',
      'Chrono Trigger',
      'EarthBound',
    ])
    await expect(
      page.getByRole('columnheader', { name: 'Hours played' }),
    ).toHaveAttribute('aria-sort', 'descending')
    await page.getByRole('button', { name: 'Hours played' }).click()
    await expect(names(page)).toHaveText([
      'EarthBound',
      'Chrono Trigger',
      'Mega Man 2',
    ])

    // Games without a value stay last either way.
    await page.getByRole('button', { name: 'Rating' }).click()
    await expect(names(page).first()).toHaveText('Chrono Trigger')
    await page.getByRole('button', { name: 'Rating' }).click()
    await expect(names(page).first()).toHaveText('Chrono Trigger')
  })

  test('can search and filter, and nothing is editable', async ({ page }) => {
    await openCollection(page, false)
    await expect(page.getByRole('button', { name: /Notes for/ })).toHaveCount(0)
    await expect(page.getByRole('checkbox')).toHaveCount(0)

    await page
      .getByRole('searchbox', { name: 'Search this collection' })
      .fill('hard')
    await expect(names(page)).toHaveText(['Mega Man 2'])
    await expect(page.getByText('Showing 1 of 3')).toBeVisible()

    await page.getByRole('button', { name: 'Clear' }).click()
    await page.getByRole('button', { name: 'Filter' }).click()
    await page.getByRole('menuitem', { name: 'Status' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Playing' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Finished' }).click()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(names(page)).toHaveText(['Chrono Trigger', 'EarthBound'])
  })
})

test.describe('owners', () => {
  test('edit values in place', async ({ page }) => {
    const saved: unknown[] = []
    await page.route(`**/api/collections/${collectionId}/items/*`, (route) => {
      const { values } = route.request().postDataJSON() as {
        values: Record<string, unknown>
      }
      saved.push(values)
      const id = route.request().url().split('/').pop()
      const current = items.find((entry) => entry.id === id)!
      return route.fulfill({
        json: { ...current, data: { ...current.data, ...values } },
      })
    })
    await openCollection(page, true)

    // Text: click, type, Enter.
    await page
      .getByRole('button', { name: 'Notes for EarthBound: empty' })
      .click()
    await page
      .getByRole('textbox', { name: 'Notes for EarthBound' })
      .fill('Ness!')
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('button', { name: 'Notes for EarthBound: Ness!' }),
    ).toBeVisible()

    // Escape cancels without saving.
    await page
      .getByRole('button', { name: 'Hours played for EarthBound: 9' })
      .click()
    await page
      .getByRole('spinbutton', { name: 'Hours played for EarthBound' })
      .fill('12')
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('button', { name: 'Hours played for EarthBound: 9' }),
    ).toBeVisible()

    // Checkbox, rating and select save on click.
    await page.getByRole('checkbox', { name: 'Beaten for EarthBound' }).click()
    await page
      .getByRole('group', { name: 'Rating for EarthBound' })
      .getByRole('button', { name: '4 stars' })
      .click()
    await page.getByRole('combobox', { name: 'Status for EarthBound' }).click()
    await page.getByRole('option', { name: 'Finished' }).click()
    await expect(
      page.getByRole('combobox', { name: 'Status for EarthBound' }),
    ).toHaveText('Finished')

    expect(saved).toEqual([
      { notes: 'Ness!' },
      { done: true },
      { rating: 4 },
      { status: 'Finished' },
    ])
  })

  test('a failed save is undone with a message', async ({ page }) => {
    await page.route(`**/api/collections/${collectionId}/items/*`, (route) =>
      route.fulfill({ status: 500, json: {} }),
    )
    await openCollection(page, true)
    const beaten = page.getByRole('checkbox', { name: 'Beaten for EarthBound' })
    await beaten.click()
    await expect(
      page.getByText("Couldn't save that change. Try again."),
    ).toBeVisible()
    await expect(beaten).not.toBeChecked()
  })

  test('remove a game from the collection', async ({ page }) => {
    let removed = ''
    await page.route(`**/api/collections/${collectionId}/items/*`, (route) => {
      removed = `${route.request().method()} ${route.request().url().split('/').pop()}`
      return route.fulfill({ status: 204 })
    })
    await openCollection(page, true)
    await page.getByRole('button', { name: 'Actions for Mega Man 2' }).click()
    await page.getByRole('menuitem', { name: 'Remove from collection' }).click()
    await expect(names(page)).toHaveText(['Chrono Trigger', 'EarthBound'])
    await expect(page.getByText('2 games').first()).toBeVisible()
    expect(removed).toBe(`DELETE ${items[2]!.id}`)
  })

  test('rename a game', async ({ page }) => {
    let renamed: unknown
    await page.route(`**/api/library-items/${items[1]!.id}`, (route) => {
      renamed = route.request().postDataJSON()
      return route.fulfill({ json: { ...items[1], name: 'Mother 2' } })
    })
    await openCollection(page, true)
    await page.getByRole('button', { name: 'Actions for EarthBound' }).click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    const dialog = page.getByRole('dialog', { name: 'Rename game' })
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Mother 2')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('link', { name: 'Mother 2' })).toBeVisible()
    expect(renamed).toEqual({ name: 'Mother 2' })
  })

  test('the header row does not light up on hover', async ({ page }) => {
    await openCollection(page, true)
    const header = page.getByRole('table').locator('thead tr')
    await header.hover()
    await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  })

  test('the covers view is remembered', async ({ page }) => {
    await openCollection(page, true)
    await page.getByRole('button', { name: 'Covers' }).click()
    await expect(page.getByRole('table')).toBeHidden()
    await page.reload()
    await expect(
      page.getByRole('link', { name: 'Chrono Trigger' }),
    ).toBeVisible()
    await expect(page.getByRole('table')).toBeHidden()
  })
})

test.describe('long collections', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    igdbId: 1000 + i,
    name: `Game ${String(i + 1).padStart(2, '0')}`,
    coverId: null,
    data: {},
    addedAt: '2026-01-01T00:00:00.000Z',
  }))

  test.beforeEach(async ({ page }) => {
    await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
      route.fulfill({
        json: { ...detail(true), items: many, itemCount: many.length },
      }),
    )
    await page.route(`**/api/collections/${collectionId}/items/*`, (route) =>
      route.fulfill({
        json: { ...many[27]!, data: { notes: 'Saved' } },
      }),
    )
    await page.goto('/u/retro_fan/shelf/snes-games')
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('are split into pages', async ({ page }) => {
    const pages = page.getByRole('navigation', { name: 'Pages' })
    await expect(pages.getByText('1–25 of 30')).toBeVisible()
    await expect(names(page)).toHaveCount(25)

    await pages.getByRole('button', { name: 'Next page' }).click()
    await expect(pages.getByText('26–30 of 30')).toBeVisible()
    await expect(names(page)).toHaveCount(5)
    await expect(
      pages.getByRole('button', { name: 'Next page' }),
    ).toBeDisabled()

    // Editing a value doesn't jump back to the first page.
    await page.getByRole('button', { name: 'Notes for Game 28: empty' }).click()
    await page.getByRole('textbox', { name: 'Notes for Game 28' }).fill('Saved')
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('button', { name: 'Notes for Game 28: Saved' }),
    ).toBeVisible()
    await expect(pages.getByText('26–30 of 30')).toBeVisible()

    // A search starts again from the first page.
    await page
      .getByRole('searchbox', { name: 'Search this collection' })
      .fill('Game 1')
    // Game 01, 10 to 19 and 21.
    await expect(names(page)).toHaveCount(12)
    await expect(pages).toBeHidden()
  })

  test('can show more per page', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Per page' }).click()
    await page.getByRole('option', { name: '50' }).click()
    await expect(names(page)).toHaveCount(30)
  })

  test('keep the row menu on one line', async ({ page }) => {
    await page.getByRole('button', { name: 'Actions for Game 01' }).click()
    const remove = page.getByRole('menuitem', {
      name: 'Remove from collection',
    })
    await expect(remove).toBeVisible()
    expect((await remove.boundingBox())!.height).toBeLessThan(40)
  })
})
