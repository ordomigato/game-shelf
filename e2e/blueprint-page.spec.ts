import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const id = '20000000-0000-4000-8000-000000000011'
const fields = [
  {
    id: 'condition',
    name: 'Condition',
    type: 'select',
    options: ['Loose', 'Boxed'],
  },
  { id: 'notes', name: 'Notes', type: 'text' },
]
const using = [
  {
    id: '10000000-0000-4000-8000-000000000011',
    title: 'NES Games',
    slug: 'nes-games',
    kind: 'custom',
    itemCount: 12,
  },
  {
    id: '10000000-0000-4000-8000-000000000012',
    title: 'SNES Games',
    slug: 'snes-games',
    kind: 'custom',
    itemCount: 4,
  },
]
const blueprint = (collections = using) => ({
  id,
  name: 'Collector basics',
  shared: true,
  fields,
  usedBy: collections.length,
  collections,
})

async function openBlueprint(page: Page, collections = using) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route(`**/api/blueprints/${id}`, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: blueprint(collections) })
      : route.fallback(),
  )
  await page.goto(`/blueprints/${id}`)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Collector basics' }),
  ).toBeVisible()
}

test('the list shows each blueprint and opens it', async ({ page }) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/blueprints', (route) =>
    route.fulfill({
      json: [{ id, name: 'Collector basics', fieldCount: 2, usedBy: 2 }],
    }),
  )
  await page.route(`**/api/blueprints/${id}`, (route) =>
    route.fulfill({ json: blueprint() }),
  )
  await page.goto('/blueprints')
  const link = page.getByRole('link', { name: /Collector basics/ })
  await expect(link).toContainText('2 fields · Used by 2 collections')
  await link.click()
  await expect(page).toHaveURL(new RegExp(`/blueprints/${id}$`))
})

test('lists the collections it changes', async ({ page }) => {
  await openBlueprint(page)
  const usedBy = page.getByRole('link', { name: 'NES Games', exact: true })
  await expect(usedBy).toHaveAttribute('href', '/u/retro_fan/shelf/nes-games')
  await expect(page.getByText('12 games')).toBeVisible()
  // Can't be deleted while collections use it.
  await expect(
    page.getByRole('button', { name: 'Delete blueprint' }),
  ).toHaveCount(0)
})

test('renames it', async ({ page }) => {
  await openBlueprint(page)
  let renamed: unknown
  await page.route(`**/api/blueprints/${id}`, (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    renamed = route.request().postDataJSON()
    return route.fulfill({ json: { ...blueprint(), name: 'Collector set' } })
  })
  await page
    .getByRole('textbox', { name: 'Blueprint name' })
    .fill('Collector set')
  await page.getByRole('button', { name: 'Rename' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Collector set' }),
  ).toBeVisible()
  expect(renamed).toEqual({ name: 'Collector set' })
})

test('shows what saving changes across collections first', async ({ page }) => {
  await openBlueprint(page)
  const previews: unknown[] = []
  await page.route(`**/api/blueprints/${id}/preview`, (route) => {
    previews.push(route.request().postDataJSON())
    return route.fulfill({
      json: { collections: using, lost: [{ name: 'Notes', count: 5 }] },
    })
  })
  const saves: unknown[] = []
  await page.route(`**/api/blueprints/${id}/fields`, (route) => {
    saves.push(route.request().postDataJSON())
    return route.fulfill({ json: { ...blueprint(), fields: [fields[0]] } })
  })

  await page.getByRole('button', { name: 'Remove Notes' }).click()
  await page.getByRole('button', { name: 'Save fields' }).click()

  const review = page.getByRole('alertdialog', { name: 'Before you save' })
  await expect(review).toContainText(
    'This changes 2 collections with 16 games in all.',
  )
  await expect(review).toContainText('NES Games · 12 games')
  await expect(review.getByRole('alert')).toContainText(
    'Notes: deleted from 5 games',
  )
  await expect(review).toContainText("This can't be undone.")
  expect(saves).toHaveLength(0)
  expect(previews).toEqual([{ fields: [fields[0]], optionRenames: {} }])

  const confirm = review.getByRole('button', { name: 'Delete values and save' })
  await expect(confirm).toBeDisabled()
  await review
    .getByRole('checkbox', {
      name: 'I understand these values will be deleted',
    })
    .click()
  await confirm.click()
  await expect(page.getByText('Blueprint saved')).toBeVisible()
  expect(saves).toEqual([{ fields: [fields[0]], optionRenames: {} }])
})

test('an unused blueprint can be deleted', async ({ page }) => {
  await openBlueprint(page, [])
  let deleted = false
  await page.route(`**/api/blueprints/${id}`, (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    deleted = true
    return route.fulfill({ status: 204 })
  })
  await page.route('**/api/blueprints', (route) => route.fulfill({ json: [] }))
  await expect(
    page.getByText('No collection uses this blueprint.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Delete blueprint' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete blueprint' })
    .click()
  await expect(page).toHaveURL(/\/blueprints$/)
  expect(deleted).toBe(true)
})
