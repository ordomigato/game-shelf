import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const collectionId = '10000000-0000-4000-8000-000000000007'
const setId = '20000000-0000-4000-8000-000000000007'
const fields = [
  { id: 'condition', name: 'Condition', type: 'select', options: ['Loose'] },
  { id: 'price', name: 'Price paid', type: 'currency', currency: 'USD' },
]
const privateBlueprint = {
  id: setId,
  name: null,
  shared: false,
  fields,
  usedBy: 1,
}
const sharedBlueprint = (usedBy: number) => ({
  ...privateBlueprint,
  name: 'Collector basics',
  shared: true,
  usedBy,
})
const summary = {
  id: collectionId,
  title: 'GameCube Games',
  slug: 'gamecube-games',
  description: null,
  visibility: 'private',
  kind: 'custom',
  itemCount: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const detail = (blueprint: unknown) => ({
  ...summary,
  isOwner: true,
  blueprint,
  items: [
    {
      id: '30000000-0000-4000-8000-000000000071',
      igdbId: 2001,
      name: 'Wind Waker',
      coverId: null,
      data: { condition: 'Loose' },
      addedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
})

/**
 * Opens the collection page with the given blueprint. The returned setter
 * changes what later reloads of the page get.
 */
async function openCollection(page: Page, blueprint: unknown) {
  let current = blueprint
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/u/retro_fan/collections/gamecube-games', (route) =>
    route.fulfill({ json: detail(current) }),
  )
  await page.goto('/u/retro_fan/shelf/gamecube-games')
  await expect(page.getByRole('table')).toBeVisible()
  return (next: unknown) => {
    current = next
  }
}

const usesBlueprint = (page: Page) => page.getByText('Uses the blueprint')

async function openActions(page: Page) {
  await page.getByRole('button', { name: 'Collection actions' }).click()
}

test('saves a collection’s fields as a blueprint', async ({ page }) => {
  await openCollection(page, privateBlueprint)
  const sent: unknown[] = []
  await page.route(
    `**/api/collections/${collectionId}/blueprint/share`,
    (route) => {
      sent.push(route.request().postDataJSON())
      return route.fulfill({ json: sharedBlueprint(1) })
    },
  )

  await openActions(page)
  await expect(
    page.getByRole('menuitem', { name: 'Detach from blueprint' }),
  ).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Save as blueprint' }).click()
  const dialog = page.getByRole('dialog', { name: 'Save as a blueprint' })
  const save = dialog.getByRole('button', { name: 'Save blueprint' })
  await expect(save).toBeDisabled()
  await dialog.getByLabel('Blueprint name').fill('  Collector basics  ')
  await save.click()

  await expect(dialog).toBeHidden()
  expect(sent).toEqual([{ name: 'Collector basics' }])
  await expect(usesBlueprint(page)).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Collector basics' }),
  ).toHaveAttribute('href', `/blueprints/${setId}`)
  await openActions(page)
  await expect(
    page.getByRole('menuitem', { name: 'Detach from blueprint' }),
  ).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: 'Save as blueprint' }),
  ).toHaveCount(0)
})

test('says so when a blueprint name is already in use', async ({ page }) => {
  await openCollection(page, privateBlueprint)
  await page.route(
    `**/api/collections/${collectionId}/blueprint/share`,
    (route) =>
      route.fulfill({
        status: 409,
        json: { statusMessage: 'Blueprint name taken' },
      }),
  )

  await openActions(page)
  await page.getByRole('menuitem', { name: 'Save as blueprint' }).click()
  const dialog = page.getByRole('dialog', { name: 'Save as a blueprint' })
  await dialog.getByLabel('Blueprint name').fill('collector basics')
  await dialog.getByRole('button', { name: 'Save blueprint' }).click()

  await expect(dialog.getByRole('alert')).toHaveText(
    'You already have a blueprint with that name.',
  )
  await expect(dialog).toBeVisible()
})

async function createFromBlueprint(page: Page, copy: boolean) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/u/retro_fan/collections', (route) =>
    route.fulfill({ json: [summary] }),
  )
  await page.route('**/api/blueprints', (route) =>
    route.fulfill({
      json: [
        { id: setId, name: 'Collector basics', fieldCount: 2 },
        {
          id: '20000000-0000-4000-8000-000000000008',
          name: 'Empty set',
          fieldCount: 0,
        },
      ],
    }),
  )
  let created: unknown
  await page.route('**/api/collections', (route) => {
    // The new collection's page also lists the owner's collections.
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    created = route.request().postDataJSON()
    return route.fulfill({
      status: 201,
      json: {
        ...summary,
        id: 'new',
        title: 'Wii Games',
        slug: 'wii-games',
        itemCount: 0,
      },
    })
  })
  await page.route('**/api/u/retro_fan/collections/wii-games', (route) =>
    route.fulfill({
      json: {
        ...detail(sharedBlueprint(2)),
        title: 'Wii Games',
        slug: 'wii-games',
        items: [],
        itemCount: 0,
      },
    }),
  )

  await page.goto('/u/retro_fan/shelf')
  await page.getByRole('button', { name: 'New collection' }).click()
  const dialog = page.getByRole('dialog', { name: 'New collection' })
  await expect(dialog.getByText('Your blueprints')).toBeVisible()
  await expect(dialog.getByText('2 fields')).toBeVisible()
  await expect(dialog.getByText('No fields')).toBeVisible()
  await dialog.getByLabel('Name', { exact: true }).fill('Wii Games')
  await dialog.getByRole('radio', { name: /Collector basics/ }).check()
  const linked = dialog.getByRole('checkbox', {
    name: 'Keep linked to the blueprint',
  })
  await expect(linked).toBeChecked()
  if (copy) {
    await linked.click()
    await expect(
      dialog.getByText('This collection gets its own copy of the fields'),
    ).toBeVisible()
  }
  await dialog.getByRole('button', { name: 'Create collection' }).click()

  await expect(page).toHaveURL(/\/u\/retro_fan\/shelf\/wii-games$/)
  expect(created).toEqual({
    title: 'Wii Games',
    description: null,
    blueprintId: setId,
    copy,
  })
}

test('creates a collection that uses a blueprint', async ({ page }) => {
  await createFromBlueprint(page, false)
})

test('creates a collection from a copy of a blueprint', async ({ page }) => {
  await createFromBlueprint(page, true)
})

test('shared fields are edited on the blueprint page', async ({ page }) => {
  await openCollection(page, sharedBlueprint(3))
  await page.getByRole('button', { name: 'Edit fields' }).click()
  const dialog = page.getByRole('dialog', { name: 'Fields' })
  await expect(
    dialog.getByText(
      'These fields come from the blueprint "Collector basics".',
    ),
  ).toBeVisible()
  await expect(dialog.getByText("It's used by 3 collections.")).toBeVisible()
  // No editing here, only the way to the blueprint or a detach.
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
  await expect(
    dialog.getByRole('link', { name: 'Edit blueprint' }),
  ).toHaveAttribute('href', `/blueprints/${setId}`)
})

test('a blueprint used once is also edited on its page', async ({ page }) => {
  await openCollection(page, sharedBlueprint(1))
  await page.getByRole('button', { name: 'Edit fields' }).click()
  const dialog = page.getByRole('dialog', { name: 'Fields' })
  await expect(dialog.getByText("It's used by 1 collection.")).toBeVisible()
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
})

test('detaching from the field editor opens the own copy for editing', async ({
  page,
}) => {
  const setBlueprint = await openCollection(page, sharedBlueprint(3))
  let detached = 0
  await page.route(
    `**/api/collections/${collectionId}/blueprint/detach`,
    (route) => {
      detached++
      const copy = {
        ...privateBlueprint,
        id: '20000000-0000-4000-8000-000000000009',
      }
      setBlueprint(copy)
      return route.fulfill({ json: copy })
    },
  )
  await page.getByRole('button', { name: 'Edit fields' }).click()
  const dialog = page.getByRole('dialog', { name: 'Fields' })
  await dialog.getByRole('button', { name: 'Detach and edit here' }).click()

  await expect(dialog.getByRole('textbox', { name: 'Field name' })).toHaveCount(
    2,
  )
  expect(detached).toBe(1)
  await expect(usesBlueprint(page)).toBeHidden()
})

test('detaches a collection from its blueprint', async ({ page }) => {
  const setBlueprint = await openCollection(page, sharedBlueprint(3))
  let detached = 0
  await page.route(
    `**/api/collections/${collectionId}/blueprint/detach`,
    (route) => {
      detached++
      const copy = {
        ...privateBlueprint,
        id: '20000000-0000-4000-8000-000000000009',
      }
      setBlueprint(copy)
      return route.fulfill({ json: copy })
    },
  )
  await expect(usesBlueprint(page)).toBeVisible()

  await openActions(page)
  await page.getByRole('menuitem', { name: 'Detach from blueprint' }).click()

  await expect(usesBlueprint(page)).toBeHidden()
  expect(detached).toBe(1)
  await openActions(page)
  await expect(
    page.getByRole('menuitem', { name: 'Save as blueprint' }),
  ).toBeVisible()
})
