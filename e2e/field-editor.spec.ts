import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collectionId = '10000000-0000-4000-8000-000000000005'
const fields = [
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: ['Backlog', 'Playing', 'Finished'],
  },
  { id: 'price', name: 'Price paid', type: 'currency', currency: 'USD' },
  { id: 'notes', name: 'Notes', type: 'text' },
]
const items = [
  {
    id: '30000000-0000-4000-8000-000000000031',
    igdbId: 501,
    name: 'Chrono Trigger',
    coverId: null,
    data: { status: 'Playing', price: 40, notes: 'Second run' },
    addedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '30000000-0000-4000-8000-000000000032',
    igdbId: 502,
    name: 'EarthBound',
    coverId: null,
    data: { status: 'Backlog' },
    addedAt: '2026-01-02T00:00:00.000Z',
  },
]
const detail = (userFields: unknown[]) => ({
  id: collectionId,
  title: 'SNES Games',
  slug: 'snes-games',
  description: null,
  visibility: 'private',
  itemCount: items.length,
  updatedAt: '2026-01-01T00:00:00.000Z',
  isOwner: true,
  fields: userFields,
  items,
})

type Impact = { lost: { name: string; count: number }[] }
type Saved = { fields: unknown[]; optionRenames: unknown }

/**
 * Stubs the account's fields: reading them, checking what a save would
 * change (answering with `impact`) and saving. Returns the saved bodies.
 */
async function stubFields(
  page: Page,
  start: unknown[],
  impact: Impact = { lost: [] },
) {
  let current = start
  const saved: Saved[] = []
  await page.route('**/api/me/fields', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: current })
    }
    const body = route.request().postDataJSON() as Saved
    saved.push(body)
    current = body.fields
    return route.fulfill({ json: current })
  })
  await page.route('**/api/me/fields/preview', (route) =>
    route.fulfill({ json: impact }),
  )
  return { saved, current: () => current }
}

/** Opens the editor on a collection. Returns the bodies sent to save. */
async function openEditor(page: Page, impact?: Impact) {
  await signInAs(page, { username: 'retro_fan' })
  const stub = await stubFields(page, fields, impact)
  await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
    route.fulfill({ json: detail(stub.current()) }),
  )
  await page.goto('/u/retro_fan/shelf/snes-games')
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByRole('button', { name: 'Collection actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit fields' }).click()
  await expect(page.getByRole('dialog', { name: 'Fields' })).toBeVisible()
  return stub.saved
}

test('amounts show their currency', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
    route.fulfill({ json: detail(fields) }),
  )
  await page.goto('/u/retro_fan/shelf/snes-games')
  await expect(
    page.getByRole('button', { name: 'Price paid for Chrono Trigger: $40.00' }),
  ).toBeVisible()
})

test('adds a field and renames a choice', async ({ page }) => {
  const saved = await openEditor(page)
  const dialog = page.getByRole('dialog', { name: 'Fields' })

  await dialog
    .getByRole('textbox', { name: 'Choice for Status' })
    .nth(1)
    .fill('Now playing')
  await dialog.getByRole('button', { name: 'Add field' }).click()
  await dialog
    .getByRole('textbox', { name: 'Field name' })
    .last()
    .fill('Platform')
  await dialog.getByRole('button', { name: 'Save fields' }).click()

  await expect(dialog).toBeHidden()
  expect(saved).toHaveLength(1)
  expect(saved[0]!.optionRenames).toEqual({
    status: { Playing: 'Now playing' },
  })
  expect(saved[0]!.fields).toEqual([
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: ['Backlog', 'Now playing', 'Finished'],
    },
    { id: 'price', name: 'Price paid', type: 'currency', currency: 'USD' },
    { id: 'notes', name: 'Notes', type: 'text' },
    { id: expect.any(String), name: 'Platform', type: 'text' },
  ])
  await expect(
    page.getByRole('columnheader', { name: 'Platform' }),
  ).toBeVisible()
})

test('asks before clearing values', async ({ page }) => {
  const saved = await openEditor(page, {
    lost: [
      { name: 'Status', count: 2 },
      { name: 'Notes', count: 1 },
    ],
  })
  const dialog = page.getByRole('dialog', { name: 'Fields' })

  await dialog.getByRole('button', { name: 'Remove Notes' }).click()
  // Status becomes a number: neither "Playing" nor "Backlog" fits.
  await dialog.getByRole('combobox', { name: 'Type of Status' }).click()
  await page.getByRole('option', { name: 'Number' }).click()
  await dialog.getByRole('button', { name: 'Save fields' }).click()

  const warning = dialog.getByRole('alert')
  await expect(warning).toContainText(
    'Saved values will be permanently deleted',
  )
  await expect(warning.getByRole('listitem')).toHaveText([
    'Status: deleted from 2 games',
    'Notes: deleted from 1 game',
  ])
  await expect(warning).toContainText("This can't be undone.")
  // The delete button waits for the tick.
  const confirm = dialog.getByRole('button', { name: 'Delete values and save' })
  await expect(confirm).toBeDisabled()
  expect(saved).toHaveLength(0)

  // Going back keeps the changes, so they can be fixed.
  await dialog.getByRole('button', { name: 'Go back' }).click()
  await expect(
    dialog.getByRole('button', { name: 'Remove Notes' }),
  ).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Save fields' }).click()
  await dialog
    .getByRole('checkbox', {
      name: 'I understand these values will be deleted',
    })
    .click()
  await confirm.click()
  await expect(dialog).toBeHidden()
  expect(saved).toHaveLength(1)
})

test('removing an empty field still asks, without the warning', async ({
  page,
}) => {
  await signInAs(page, { username: 'retro_fan' })
  const withExtra = [...fields, { id: 'shelf', name: 'Shelf', type: 'text' }]
  const { saved } = await stubFields(page, withExtra)
  await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
    route.fulfill({ json: detail(withExtra) }),
  )
  await page.goto('/u/retro_fan/shelf/snes-games')
  await page.getByRole('button', { name: 'Collection actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit fields' }).click()
  const dialog = page.getByRole('dialog', { name: 'Fields' })

  await dialog.getByRole('button', { name: 'Remove Shelf' }).click()
  await dialog.getByRole('button', { name: 'Save fields' }).click()
  await expect(
    dialog.getByText('Removing Shelf. No games have a value for it.'),
  ).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Save fields' }).click()
  await expect(dialog).toBeHidden()
  expect(saved).toHaveLength(1)
})

test('explains what to fix before saving', async ({ page }) => {
  const saved = await openEditor(page)
  const dialog = page.getByRole('dialog', { name: 'Fields' })

  await dialog.getByRole('button', { name: 'Add field' }).click()
  await dialog.getByRole('textbox', { name: 'Field name' }).last().fill('notes')
  await dialog.getByRole('button', { name: 'Save fields' }).click()
  await expect(dialog.getByRole('alert')).toHaveText(
    'There are two fields called "notes". Give each a different name.',
  )
  expect(saved).toHaveLength(0)
})

test('scores out of 10 edit like numbers and keep their place', async ({
  page,
}) => {
  await signInAs(page, { username: 'retro_fan' })
  const stub = await stubFields(page, [
    { id: 'score', name: 'Score', type: 'rating' },
  ])
  const saved = stub.saved
  const scored = items.map((item, i) => ({
    ...item,
    data: { score: [4, 2][i] },
  }))
  await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
    route.fulfill({ json: { ...detail(stub.current()), items: scored } }),
  )
  await page.goto('/u/retro_fan/shelf/snes-games')
  await expect(
    page.getByRole('group', { name: 'Score for Chrono Trigger' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Collection actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit fields' }).click()
  const dialog = page.getByRole('dialog', { name: 'Fields' })
  await dialog.getByRole('combobox', { name: 'What Score is out of' }).click()
  await page.getByRole('option', { name: '10', exact: true }).click()
  await dialog.getByRole('button', { name: 'Save fields' }).click()
  await expect(dialog).toBeHidden()
  expect(saved[0]!.fields).toEqual([
    { id: 'score', name: 'Score', type: 'rating', scale: 10 },
  ])
  // The stub keeps the old values, so this just checks the new display.
  const cell = page.getByRole('button', {
    name: 'Score for Chrono Trigger: 4/10',
  })
  await expect(cell).toBeVisible()

  // And a score out of 10 saves like a number.
  const values: unknown[] = []
  await page.route(`**/api/collections/${collectionId}/items/*`, (route) => {
    values.push(route.request().postDataJSON())
    return route.fulfill({
      json: { ...scored[0], data: { score: 9 } },
    })
  })
  // Out of range: the hint shows, Enter keeps the box open, and leaving
  // puts the old value back without saving.
  await cell.click()
  const box = page.getByRole('spinbutton', { name: 'Score for Chrono Trigger' })
  await expect(page.getByText('/ 10')).toBeVisible()
  await box.fill('15')
  // Shown floating under the box, and read out as the box's description.
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText(
    'A whole number from 0 to 10',
  )
  await expect(box).toHaveAccessibleDescription('A whole number from 0 to 10')
  await expect(box).toHaveAttribute('aria-invalid', 'true')
  await page.keyboard.press('Enter')
  await expect(box).toBeVisible()
  await page.getByRole('heading', { level: 1 }).click()
  await expect(cell).toBeVisible()
  expect(values).toEqual([])

  await cell.click()
  await page
    .getByRole('spinbutton', { name: 'Score for Chrono Trigger' })
    .fill('9')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Score for Chrono Trigger: 9/10' }),
  ).toBeVisible()
  expect(values).toEqual([{ values: { score: 9 } }])
})

test('suggests common fields, one click each, while there is room', async ({
  page,
}) => {
  const saved = await openEditor(page)
  const dialog = page.getByRole('dialog', { name: 'Fields' })

  // Already have Status and Notes, so those aren't offered.
  await expect(dialog.getByRole('button', { name: 'Add Status' })).toHaveCount(
    0,
  )
  await dialog.getByRole('button', { name: 'Add Rating' }).click()
  await expect(dialog.getByText('4 of 5 extra fields per game')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add Progress' }).click()
  // Full at 5 of 5: suggestions and Add field are off.
  await expect(
    dialog.getByRole('button', { name: 'Add Region' }),
  ).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Add field' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Save fields' }).click()
  await expect(dialog).toBeHidden()
  expect(saved[0]!.fields).toEqual([
    expect.objectContaining({ id: 'status' }),
    expect.objectContaining({ id: 'price' }),
    expect.objectContaining({ id: 'notes' }),
    { id: expect.any(String), name: 'Rating', type: 'rating', scale: 5 },
    { id: expect.any(String), name: 'Progress', type: 'progress' },
  ])
})

test('the account page edits the same fields for every game', async ({
  page,
}) => {
  await signInAs(page, { username: 'retro_fan' })
  const { saved } = await stubFields(page, fields)
  await page.goto('/account/fields')
  await expect(page.getByRole('heading', { name: 'Fields' })).toBeVisible()
  await expect(
    page.getByText('They are the same in all your collections.'),
  ).toBeVisible()
  await expect(page.getByText('3 of 5 extra fields per game')).toBeVisible()

  await page.getByRole('button', { name: 'Add Region' }).click()
  await page.getByRole('button', { name: 'Save fields' }).click()
  await expect(page.getByText('Fields saved')).toBeVisible()
  expect(saved).toHaveLength(1)
  expect(saved[0]!.fields).toHaveLength(4)
  await expect(page.getByText('4 of 5 extra fields per game')).toBeVisible()
})

test('hides a field from visitors and marks its column', async ({ page }) => {
  const saved = await openEditor(page)
  const dialog = page.getByRole('dialog', { name: 'Fields' })
  await expect(
    page.getByRole('img', { name: 'Hidden from visitors' }),
  ).toHaveCount(0)

  await dialog
    .getByRole('checkbox', { name: 'Hide Price paid from visitors' })
    .click()
  await dialog.getByRole('button', { name: 'Save fields' }).click()

  await expect(dialog).toBeHidden()
  expect(saved[0]!.fields).toEqual([
    expect.objectContaining({ id: 'status' }),
    {
      id: 'price',
      name: 'Price paid',
      type: 'currency',
      currency: 'USD',
      hidden: true,
    },
    expect.objectContaining({ id: 'notes' }),
  ])
  await expect(
    page
      .getByRole('columnheader', { name: 'Price paid' })
      .getByRole('img', { name: 'Hidden from visitors' }),
  ).toBeVisible()
})
