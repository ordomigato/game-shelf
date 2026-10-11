import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const summary = (
  title: string,
  updatedAt: string,
  extra: Record<string, unknown> = {},
) => ({
  id: crypto.randomUUID(),
  title,
  slug: title.toLowerCase().replaceAll(' ', '-'),
  description: null,
  visibility: 'private',
  kind: 'custom',
  itemCount: 3,
  updatedAt,
  ...extra,
})

const wishlist = summary('Wishlist', '2026-01-01T00:00:00.000Z', {
  kind: 'wishlist',
  itemCount: 12,
})

async function signedInWith(page: Page, collections: unknown[]) {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) =>
    route.fulfill({ json: collections }),
  )
  await page.route('**/api/blueprints', (route) => route.fulfill({ json: [] }))
}

test.describe('visitors', () => {
  test('get the search header, with a way to join', async ({ page }) => {
    await page.goto('/login')
    const header = page.getByRole('banner')
    await expect(
      header.getByRole('searchbox', { name: 'Search games' }),
    ).toBeVisible()
    await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(
      header.getByRole('link', { name: 'Create account' }),
    ).toHaveAttribute('href', '/signup')
    await expect(page.getByRole('complementary')).toHaveCount(0)
  })

  test('search from the header opens the results', async ({ page }) => {
    await page.route('**/api/games/search?**', (route) =>
      route.fulfill({ json: { games: [], page: 1, hasMore: false } }),
    )
    await page.goto('/login')
    const box = page.getByRole('banner').getByRole('searchbox')
    await box.fill('metroid')
    await box.press('Enter')
    await expect(page).toHaveURL(/\/\?q=metroid$/)
    // The home page has its own search box, so the header's hides there.
    await expect(page.getByRole('banner').getByRole('searchbox')).toHaveCount(0)
  })

  test('/ jumps to the search box', async ({ page }) => {
    await page.goto('/login')
    // The sign-in form focuses its email box; the shortcut skips fields.
    await page.getByRole('heading', { name: 'Sign in' }).click()
    await page.keyboard.press('/')
    await expect(page.getByRole('banner').getByRole('searchbox')).toBeFocused()
  })
})

test.describe('signed in', () => {
  test('the sidebar lists the Wishlist, then recently changed collections', async ({
    page,
  }) => {
    await signedInWith(page, [
      wishlist,
      summary('Atari', '2026-03-01T00:00:00.000Z'),
      summary('NES Games', '2026-05-01T00:00:00.000Z'),
    ])
    await page.goto('/blueprints')
    const sidebar = page.getByRole('complementary')
    const list = sidebar.getByRole('list', { name: 'Collections' })
    await expect(list.getByRole('link')).toHaveText([
      /Wishlist\s*12/,
      /NES Games\s*3/,
      /Atari\s*3/,
    ])
    await expect(
      sidebar.getByRole('link', { name: 'Blueprints' }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('banner').getByRole('searchbox')).toBeVisible()
  })

  test('long lists link to the whole shelf', async ({ page }) => {
    const many = Array.from({ length: 10 }, (_, i) =>
      summary(`Collection ${i}`, `2026-02-${String(i + 10)}T00:00:00.000Z`),
    )
    await signedInWith(page, [wishlist, ...many])
    await page.goto('/blueprints')
    const list = page.getByRole('list', { name: 'Collections' })
    await expect(list.getByRole('link')).toHaveCount(9)
    await expect(
      list.getByRole('link', { name: 'View all 11' }),
    ).toHaveAttribute('href', '/u/retro_fan/shelf')
  })

  test('folding the collections is remembered', async ({ page }) => {
    await signedInWith(page, [wishlist])
    await page.goto('/blueprints')
    const toggle = page.getByRole('button', {
      name: 'Show or hide collections',
    })
    await toggle.click()
    await expect(page.getByRole('list', { name: 'Collections' })).toBeHidden()
    await page.reload()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('list', { name: 'Collections' })).toBeHidden()
  })

  test('the server draws the sidebar when the sign-in cookie is there', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'gs_user',
        value: encodeURIComponent(JSON.stringify({ username: 'retro_fan' })),
        url: 'http://localhost:3100',
      },
    ])
    const html = await (await page.request.get('/')).text()
    expect(html).toContain('id="sidebar-collection-list"')
    expect(html).not.toContain('href="/signup"')
  })

  test('phones get a tab bar instead of the sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await signedInWith(page, [wishlist])
    await page.goto('/blueprints')
    await expect(page.getByRole('complementary')).toBeHidden()
    const tabs = page.getByRole('navigation', { name: 'Main' })
    await expect(tabs.getByRole('link')).toHaveText([
      'Search',
      'Explore',
      'Shelf',
      'Wishlist',
    ])
    await expect(tabs.getByRole('link', { name: 'Wishlist' })).toHaveAttribute(
      'href',
      '/u/retro_fan/shelf/wishlist',
    )
  })
})
