import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAs } from './support/session'

const me = (extra: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-000000000002',
  username: 'retro_fan',
  displayName: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  plan: 'free',
  roles: ['user'],
  newFollowers: 0,
  followsPublic: true,
  ...extra,
})

async function stubShelfOf(page: Page, username: string) {
  await page.route(`**/api/u/${username}`, (route) =>
    route.fulfill({
      json: {
        username,
        displayName: 'Sam K.',
        memberSince: '2026-01-01T00:00:00.000Z',
      },
    }),
  )
  await page.route(`**/api/u/${username}/collections`, (route) =>
    route.fulfill({ json: [] }),
  )
}

const row = (username: string, extra: Record<string, unknown> = {}) => ({
  username,
  displayName: null,
  following: false,
  followsYou: false,
  mutual: false,
  isYou: false,
  ...extra,
})

test.describe('on a shelf', () => {
  test.beforeEach(async ({ page }) => {
    await stubShelfOf(page, 'sam_k')
    await page.route('**/api/u/sam_k/follow-counts', (route) =>
      route.fulfill({ json: { following: 12, followers: 34 } }),
    )
  })

  test('a visitor sees the counts, and Follow sends them to sign in', async ({
    page,
  }) => {
    await page.goto('/u/sam_k/shelf')
    await expect(
      page.getByRole('link', { name: '12 following' }),
    ).toHaveAttribute('href', '/u/sam_k/following')
    await expect(
      page.getByRole('link', { name: '34 followers' }),
    ).toHaveAttribute('href', '/u/sam_k/followers')
    await expect(
      page.getByRole('button', { name: 'Actions for sam_k' }),
    ).toBeHidden()
    await page.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(page).toHaveURL(/\/login\?redirect=\/u\/sam_k\/shelf/)
  })

  test('hides the counts when the account keeps its lists to itself', async ({
    page,
  }) => {
    await page.route('**/api/u/sam_k/follow-counts', (route) =>
      route.fulfill({ status: 404, json: { statusMessage: 'Not found' } }),
    )
    await page.goto('/u/sam_k/shelf')
    await expect(
      page.getByRole('heading', { level: 1, name: "Sam K.'s collections" }),
    ).toBeVisible()
    await expect(page.getByText(/following/)).toBeHidden()
    await expect(page.getByText(/followers/)).toBeHidden()
  })

  test('follows back and unfollows, and labels a mutual', async ({ page }) => {
    await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/me', (route) => route.fulfill({ json: me() }))
    await page.route('**/api/u/sam_k/relationship', (route) =>
      route.fulfill({
        json: { following: false, followedBy: true, blocking: false },
      }),
    )
    const calls: string[] = []
    await page.route('**/api/follows/sam_k', (route) => {
      calls.push(route.request().method())
      return route.fulfill({ status: 204 })
    })

    await page.goto('/u/sam_k/shelf')
    await expect(page.getByText('Follows you')).toBeVisible()
    await page.getByRole('button', { name: 'Follow back' }).click()
    await expect(page.getByRole('button', { name: 'Following' })).toBeVisible()
    await expect(page.getByText('Mutual')).toBeVisible()
    await page.getByRole('button', { name: 'Following' }).click()
    await expect(
      page.getByRole('button', { name: 'Follow back' }),
    ).toBeVisible()
    expect(calls).toEqual(['PUT', 'DELETE'])
  })

  test('puts the button back when following fails', async ({ page }) => {
    await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/me', (route) => route.fulfill({ json: me() }))
    await page.route('**/api/u/sam_k/relationship', (route) =>
      route.fulfill({
        json: { following: false, followedBy: false, blocking: false },
      }),
    )
    await page.route('**/api/follows/sam_k', (route) =>
      route.fulfill({
        status: 403,
        json: {
          statusMessage: 'Following limit reached',
          data: { key: 'follows.limitReached', params: { limit: 2000 } },
        },
      }),
    )
    await page.goto('/u/sam_k/shelf')
    await page.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(
      page.getByText('You can follow up to 2,000 accounts.'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Follow', exact: true }),
    ).toBeVisible()
  })

  test('blocks after a confirmation, and can unblock', async ({ page }) => {
    await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/me', (route) => route.fulfill({ json: me() }))
    await page.route('**/api/u/sam_k/relationship', (route) =>
      route.fulfill({
        json: { following: true, followedBy: true, blocking: false },
      }),
    )
    const calls: string[] = []
    await page.route('**/api/blocks/sam_k', (route) => {
      calls.push(route.request().method())
      return route.fulfill({ status: 204 })
    })

    await page.goto('/u/sam_k/shelf')
    await page.getByRole('button', { name: 'Actions for sam_k' }).click()
    await expect(
      page.getByRole('menuitem', { name: 'Remove follower' }),
    ).toBeVisible()
    await page.getByRole('menuitem', { name: 'Block' }).click()
    await expect(
      page.getByRole('alertdialog', { name: 'Block sam_k?' }),
    ).toBeVisible()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Block' })
      .click()
    await expect(
      page.getByRole('button', { name: 'Follow', exact: true }),
    ).toBeHidden()
    await expect(page.getByRole('button', { name: 'Following' })).toBeHidden()
    await page.getByRole('button', { name: 'Actions for sam_k' }).click()
    await page.getByRole('menuitem', { name: 'Unblock' }).click()
    await expect(
      page.getByRole('button', { name: 'Follow', exact: true }),
    ).toBeVisible()
    expect(calls).toEqual(['PUT', 'DELETE'])
  })
})

test('your own shelf shows no Follow button, and a dot for new followers', async ({
  page,
}) => {
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/me', (route) =>
    route.fulfill({ json: me({ newFollowers: 3 }) }),
  )
  await stubShelfOf(page, 'retro_fan')
  await page.route('**/api/u/retro_fan/follow-counts', (route) =>
    route.fulfill({ json: { following: 2, followers: 5 } }),
  )
  await page.goto('/u/retro_fan/shelf')
  await expect(page.getByRole('link', { name: '5 followers' })).toBeVisible()
  await expect(page.getByText('3 new')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Follow', exact: true }),
  ).toBeHidden()
  await expect(page.getByRole('button', { name: /^Actions for/ })).toBeHidden()
})

test.describe('the lists', () => {
  test('a visitor pages through Following, newest first, with mutuals marked', async ({
    page,
  }) => {
    const cursors: (string | null)[] = []
    await page.route('**/api/u/sam_k/following**', (route) => {
      const cursor = new URL(route.request().url()).searchParams.get('cursor')
      cursors.push(cursor)
      return route.fulfill({
        json: cursor
          ? { items: [row('jordan')], next: null }
          : {
              items: [
                row('alex', { displayName: 'Alex', mutual: true }),
                row('blake'),
              ],
              next: '2026-11-01 10:00:00.123456+00',
            },
      })
    })
    await page.goto('/u/sam_k/following')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Accounts sam_k follows' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /Alex/ })).toHaveAttribute(
      'href',
      '/u/alex/shelf',
    )
    await expect(page.getByText('Mutual')).toHaveCount(1)
    await page.getByRole('button', { name: 'Show more' }).click()
    await expect(page.getByRole('link', { name: /jordan/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show more' })).toBeHidden()
    expect(cursors).toEqual([null, '2026-11-01 10:00:00.123456+00'])
  })

  test('says so when the account keeps its lists to itself', async ({
    page,
  }) => {
    await page.route('**/api/u/sam_k/followers**', (route) =>
      route.fulfill({ status: 404, json: { statusMessage: 'Not found' } }),
    )
    await page.goto('/u/sam_k/followers')
    await expect(page.getByText("This list isn't shown")).toBeVisible()
  })

  test('on your own Followers you can remove a follower or block one, and the dot clears', async ({
    page,
  }) => {
    await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/me', (route) =>
      route.fulfill({ json: me({ newFollowers: 3 }) }),
    )
    await page.route('**/api/u/retro_fan/followers**', (route) =>
      route.fulfill({
        json: { items: [row('sam_k'), row('alex')], next: null },
      }),
    )
    const calls: string[] = []
    await page.route('**/api/me/followers-seen', (route) => {
      calls.push('seen')
      return route.fulfill({ status: 204 })
    })
    await page.route('**/api/followers/sam_k', (route) => {
      calls.push(`remove ${route.request().method()}`)
      return route.fulfill({ status: 204 })
    })
    await page.route('**/api/blocks/alex', (route) => {
      calls.push(`block ${route.request().method()}`)
      return route.fulfill({ status: 204 })
    })

    await page.goto('/u/retro_fan/followers')
    await expect(page.getByRole('link', { name: /sam_k/ })).toBeVisible()
    await expect.poll(() => calls).toContain('seen')

    await page.getByRole('button', { name: 'Actions for sam_k' }).click()
    await page.getByRole('menuitem', { name: 'Remove follower' }).click()
    await expect(page.getByRole('link', { name: /sam_k/ })).toBeHidden()

    await page.getByRole('button', { name: 'Actions for alex' }).click()
    await page.getByRole('menuitem', { name: 'Block' }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Block' })
      .click()
    await expect(page.getByRole('link', { name: /alex/ })).toBeHidden()
    expect(calls).toEqual(['seen', 'remove DELETE', 'block PUT'])
  })
})

test.describe('the home page', () => {
  const updates = {
    followsAnyone: true,
    items: [
      {
        username: 'alex',
        displayName: null,
        kind: 'collection',
        title: 'Switch backlog',
        slug: 'switch-backlog',
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        username: 'jordan',
        displayName: null,
        kind: 'wishlist',
        title: null,
        slug: null,
        updatedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      },
    ],
  }

  test('lists what accounts you follow changed, linking to it', async ({
    page,
  }) => {
    await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/me', (route) => route.fulfill({ json: me() }))
    await page.route('**/api/me/following/updates', (route) =>
      route.fulfill({ json: updates }),
    )
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'From accounts you follow' }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: /alex updated Switch backlog/ }),
    ).toHaveAttribute('href', '/u/alex/shelf/switch-backlog')
    await expect(
      page.getByRole('link', { name: /jordan updated Wishlist/ }),
    ).toHaveAttribute('href', '/u/jordan/shelf/wishlist')
  })

  test('is hidden when you follow nobody', async ({ page }) => {
    await signInAs(page, { username: 'retro_fan' })
    await page.route('**/api/me', (route) => route.fulfill({ json: me() }))
    await page.route('**/api/me/following/updates', (route) =>
      route.fulfill({ json: { followsAnyone: false, items: [] } }),
    )
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Find any game' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'From accounts you follow' }),
    ).toBeHidden()
  })

  test('is not shown to a visitor', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'From accounts you follow' }),
    ).toBeHidden()
  })
})

test.describe('in Settings', () => {
  test('the switch saves at once, and blocked accounts can be unblocked', async ({
    page,
  }) => {
    await signInAs(page, { username: 'retro_fan' })
    const patches: unknown[] = []
    await page.route('**/api/me', (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as Record<string, unknown>
        patches.push(body)
        return route.fulfill({ json: me(body) })
      }
      return route.fulfill({ json: me() })
    })
    await page.route('**/api/blocks', (route) =>
      route.fulfill({
        json: [
          {
            username: 'alex',
            displayName: 'Alex',
            since: '2026-11-01T00:00:00.000Z',
          },
        ],
      }),
    )
    let unblocked = false
    await page.route('**/api/blocks/alex', (route) => {
      unblocked = route.request().method() === 'DELETE'
      return route.fulfill({ status: 204 })
    })

    await page.goto('/account/settings')
    const box = page.getByRole('checkbox', {
      name: 'Show who I follow and who follows me',
    })
    await expect(box).toBeChecked()
    await box.click()
    await expect(box).not.toBeChecked()
    expect(patches).toEqual([{ followsPublic: false }])

    await expect(page.getByText('@alex')).toBeVisible()
    await page.getByRole('button', { name: 'Unblock' }).click()
    await expect(page.getByText('@alex')).toBeHidden()
    expect(unblocked).toBe(true)
    await expect(page.getByText("You haven't blocked anyone.")).toBeVisible()
  })
})

test('the privacy page explains following', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Following' })).toBeVisible()
  await expect(
    page.getByText('Following never shows anyone more than a visitor'),
  ).toBeVisible()
})
