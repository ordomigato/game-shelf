import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

/**
 * The page renders on the server, out of reach of browser stubs, so get
 * there from the header like a person would, once the app has taken over
 * the page (Vue sets `__vue_app__` on its root then). A click before that
 * is a full page load, rendered on the server.
 */
async function openExplore(page: Page) {
  await page.goto('/')
  await page.waitForFunction(
    () => '__vue_app__' in (document.querySelector('#__nuxt') ?? {}),
  )
  await page.getByRole('link', { name: 'Explore' }).click()
  await expect(page).toHaveURL(/\/explore$/)
}

const card = (n: number) => ({
  id: `10000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
  title: `Collection ${n}`,
  slug: `collection-${n}`,
  description: n === 1 ? 'Every licensed cart.' : null,
  itemCount: n,
  activeAt: '2026-10-01T00:00:00.000Z',
  owner: { username: 'retro_fan', displayName: n === 1 ? 'Retro Fan' : null },
  preview: [{ name: 'Chrono Trigger', coverId: null }],
})

test('lists public collections and loads more', async ({ page }) => {
  const asked: string[] = []
  await page.route('**/api/explore**', (route) => {
    const p = new URL(route.request().url()).searchParams.get('page') ?? '1'
    asked.push(p)
    return route.fulfill({
      json:
        p === '1'
          ? { collections: [card(1), card(2)], hasMore: true }
          : { collections: [card(3)], hasMore: false },
    })
  })
  await openExplore(page)

  const first = page.getByRole('link', { name: /Collection 1/ })
  await expect(first).toContainText('by Retro Fan · 1 game')
  await expect(first).toContainText('Every licensed cart.')
  await expect(first).toHaveAttribute('href', '/u/retro_fan/shelf/collection-1')
  await expect(page.getByRole('link', { name: /Collection 2/ })).toContainText(
    'by retro_fan · 2 games',
  )

  await page.getByRole('button', { name: 'Show more' }).click()
  await expect(page.getByRole('link', { name: /Collection 3/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0)
  expect(asked).toEqual(['1', '2'])
})

test('says so when there is nothing to explore yet', async ({ page }) => {
  await page.route('**/api/explore**', (route) =>
    route.fulfill({ json: { collections: [], hasMore: false } }),
  )
  await openExplore(page)
  await expect(page.getByText('No public collections yet.')).toBeVisible()
})

test.describe('find an account', () => {
  const profile = (username: string, displayName: string | null) => ({
    username,
    displayName,
    memberSince: '2026-01-01T00:00:00.000Z',
  })

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/explore**', (route) =>
      route.fulfill({ json: { collections: [], hasMore: false } }),
    )
  })

  async function openDialog(page: Page) {
    await openExplore(page)
    await page.getByRole('button', { name: 'Find an account' }).click()
    await expect(
      page.getByRole('dialog', { name: 'Find an account' }),
    ).toBeVisible()
  }
  const find = async (page: Page, name: string) => {
    await page.getByRole('dialog').getByRole('textbox').fill(name)
    await page.getByRole('button', { name: 'Find', exact: true }).click()
  }

  test('shows the account without leaving the page, signed out', async ({
    page,
  }) => {
    await page.route('**/api/u/retro_fan', (route) =>
      route.fulfill({ json: profile('retro_fan', 'Retro Fan') }),
    )
    await page.route('**/api/u/retro_fan/collections', (route) =>
      route.fulfill({ json: [] }),
    )
    await openDialog(page)
    await find(page, '  @Retro_Fan ')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Retro Fan')).toBeVisible()
    await expect(dialog.getByText('@retro_fan')).toBeVisible()
    await expect(page).toHaveURL(/\/explore$/)
    await expect(dialog.getByRole('button', { name: /Follow/ })).toHaveCount(0)
    await dialog.getByRole('link', { name: 'View shelf' }).click()
    await expect(page).toHaveURL(/\/u\/retro_fan\/shelf$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('offers Follow when signed in', async ({ page }) => {
    await signInAs(page, { username: 'sam_k' })
    await page.route('**/api/me', (route) =>
      route.fulfill({
        json: {
          id: '00000000-0000-4000-8000-000000000002',
          username: 'sam_k',
          displayName: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          plan: 'free',
          roles: ['user'],
          newFollowers: 0,
          followsPublic: true,
        },
      }),
    )
    await page.route('**/api/u/retro_fan', (route) =>
      route.fulfill({ json: profile('retro_fan', null) }),
    )
    await page.route('**/api/u/retro_fan/relationship', (route) =>
      route.fulfill({
        json: { following: false, followedBy: false, blocking: false },
      }),
    )
    await page.route('**/api/follows/retro_fan', (route) =>
      route.fulfill({ status: 204 }),
    )
    await openDialog(page)
    await find(page, 'retro_fan')
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(
      dialog.getByRole('button', { name: 'Following' }),
    ).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'View shelf' })).toBeVisible()
  })

  test('says so when no one has that username', async ({ page }) => {
    await page.route('**/api/u/nobody_here', (route) =>
      route.fulfill({ status: 404, json: { statusMessage: 'Not found' } }),
    )
    await openDialog(page)
    await find(page, 'nobody_here')
    await expect(page.getByText('No one has that username.')).toBeVisible()
    await expect(page).toHaveURL(/\/explore$/)
  })

  test('a malformed name gets the same answer without asking the server', async ({
    page,
  }) => {
    let asked = 0
    await page.route('**/api/u/**', (route) => {
      asked += 1
      return route.fulfill({ status: 404, json: {} })
    })
    await openDialog(page)
    for (const bad of ['ab', 'no spaces', 'a/b', 'x'.repeat(21)]) {
      await find(page, bad)
      await expect(page.getByText('No one has that username.')).toBeVisible()
    }
    expect(asked).toBe(0)
  })

  test('editing clears the result, and closing resets the dialog', async ({
    page,
  }) => {
    await page.route('**/api/u/retro_fan', (route) =>
      route.fulfill({ json: profile('retro_fan', null) }),
    )
    await openDialog(page)
    await find(page, 'retro_fan')
    const dialog = page.getByRole('dialog')
    const view = dialog.getByRole('link', { name: 'View shelf' })
    await expect(view).toBeVisible()
    await dialog.getByRole('textbox').fill('retro_fa')
    await expect(view).toHaveCount(0)
    await find(page, 'retro_fan')
    await expect(view).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await page.getByRole('button', { name: 'Find an account' }).click()
    await expect(page.getByRole('dialog').getByRole('textbox')).toHaveValue('')
    await expect(view).toHaveCount(0)
  })
})
