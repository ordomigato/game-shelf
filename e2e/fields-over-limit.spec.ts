import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const textFields = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `f${i}`,
    name: `Field ${i}`,
    type: 'text',
  }))

/** Opens a collection's field editor on an account with `count` fields. */
async function openEditor(page: Page, count: number) {
  const fields = textFields(count)
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/me/fields', (route) =>
    route.fulfill({ json: fields }),
  )
  await page.route('**/api/u/retro_fan/collections/snes-games', (route) =>
    route.fulfill({
      json: {
        id: '10000000-0000-4000-8000-000000000005',
        title: 'SNES Games',
        slug: 'snes-games',
        description: null,
        visibility: 'private',
        itemCount: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
        isOwner: true,
        fields,
        items: [],
      },
    }),
  )
  await page.goto('/u/retro_fan/shelf/snes-games')
  await page.getByRole('button', { name: 'Collection actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit fields' }).click()
  return page.getByRole('dialog', { name: 'Fields' })
}

test('over the field limit, the editor warns and Add is off', async ({
  page,
}) => {
  const dialog = await openEditor(page, 25)
  const alert = dialog.getByRole('alert')
  await expect(alert).toContainText(
    'You have 25 extra fields. Your plan allows 20.',
  )
  await expect(alert).toContainText("can't add more until you're down to 20")
  // Free has what Pro has here, so there is no bigger plan to point to.
  await expect(
    dialog.getByRole('link', { name: 'Need more room? Get in touch.' }),
  ).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Add field' })).toBeDisabled()
})

test('at the field limit, there is no warning and Add is off', async ({
  page,
}) => {
  const dialog = await openEditor(page, 20)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(
    dialog.getByText("You've used all 20 extra fields"),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Add field' })).toBeDisabled()
})
