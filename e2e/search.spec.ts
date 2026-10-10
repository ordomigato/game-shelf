import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

interface StubGame {
  id: number
  name: string
  coverId: string | null
  year: number | null
  platforms: string[]
}

function makeGames(count: number, start = 0): StubGame[] {
  return Array.from({ length: count }, (_, i) => ({
    id: start + i + 1,
    name: `Zelda Game ${start + i + 1}`,
    coverId: null,
    year: 1986 + i,
    platforms: ['NES', 'SNES', 'Wii', 'WiiU'],
  }))
}

async function stubSearch(
  page: Page,
  respond: (
    q: string,
    pageNumber: number,
  ) => { status?: number; body?: unknown },
) {
  await page.route('**/api/games/search?**', async (route) => {
    const url = new URL(route.request().url())
    const q = url.searchParams.get('q') ?? ''
    const pageNumber = Number(url.searchParams.get('page') ?? '1')
    const { status = 200, body } = respond(q, pageNumber)
    await route.fulfill({ status, json: body ?? {} })
  })
}

test('searching shows results and keeps the term in the URL', async ({
  page,
}) => {
  await stubSearch(page, (q, pageNumber) => ({
    body: { games: makeGames(3), page: pageNumber, hasMore: false },
  }))
  await page.goto('/')

  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')

  await expect(
    page.getByRole('heading', { name: 'Zelda Game 1' }),
  ).toBeVisible()
  const firstCard = page.getByRole('article').first()
  const platforms = firstCard.getByRole('list', { name: 'Platforms' })
  await expect(platforms.getByRole('listitem')).toHaveText([
    'NES',
    'SNES',
    'Wii',
    '+1',
  ])
  await expect(firstCard.getByText('1986')).toBeVisible()
  await expect(
    platforms.getByRole('listitem').first().locator('[data-slot="badge"]'),
  ).toBeVisible()
  await expect(page).toHaveURL(/\?q=zelda$/)
})

test('hidden platforms show in a tooltip and expand on click', async ({
  page,
}) => {
  await stubSearch(page, (_q, pageNumber) => ({
    body: { games: makeGames(1), page: pageNumber, hasMore: false },
  }))
  await page.goto('/')
  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')

  const more = page.getByRole('button', { name: 'Show 1 more platform' })
  await more.hover()
  await expect(page.getByRole('tooltip')).toHaveText('WiiU')

  await more.click()
  const platforms = page.getByRole('list', { name: 'Platforms' })
  await expect(platforms.getByRole('listitem')).toHaveText([
    'NES',
    'SNES',
    'Wii',
    'WiiU',
  ])
})

test('a long platform name stays inside its card', async ({ page }) => {
  const longName = "Terebikko / See 'n Say Video Phone"
  await stubSearch(page, (_q, pageNumber) => ({
    body: {
      games: [
        {
          id: 1,
          name: 'Super Mario World: Mario to Yoshi no Bouken Land',
          coverId: null,
          year: 1991,
          platforms: [longName],
        },
      ],
      page: pageNumber,
      hasMore: false,
    },
  }))
  await page.goto('/')
  await page.getByRole('searchbox', { name: 'Search games' }).fill('mario')

  const card = page.getByRole('article').first()
  const pill = card.getByText(longName)
  await expect(pill).toBeVisible()
  const cardBox = await card.boundingBox()
  const pillBox = await pill.boundingBox()
  expect(pillBox!.x + pillBox!.width).toBeLessThanOrEqual(
    cardBox!.x + cardBox!.width + 0.5,
  )

  await pill.hover()
  await expect(page.getByRole('tooltip')).toHaveText(longName)
})

test('one character asks for more instead of searching', async ({ page }) => {
  let calls = 0
  await stubSearch(page, () => {
    calls++
    return { body: { games: [], page: 1, hasMore: false } }
  })
  await page.goto('/')

  await page.getByRole('searchbox', { name: 'Search games' }).fill('z')

  await expect(page.getByText('Type at least 2 characters.')).toBeVisible()
  await page.waitForTimeout(500)
  expect(calls).toBe(0)
})

test('shows a message when nothing matches', async ({ page }) => {
  await stubSearch(page, () => ({
    body: { games: [], page: 1, hasMore: false },
  }))
  await page.goto('/')

  await page.getByRole('searchbox', { name: 'Search games' }).fill('qwxyz')

  await expect(page.getByText('No games found for "qwxyz".')).toBeVisible()
})

test('shows an error with a retry when search fails', async ({ page }) => {
  let fail = true
  await stubSearch(page, (_q, pageNumber) =>
    fail
      ? { status: 502, body: { statusMessage: 'Game data unavailable' } }
      : { body: { games: makeGames(2), page: pageNumber, hasMore: false } },
  )
  await page.goto('/')

  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
  await expect(page.getByText("Search isn't working right now.")).toBeVisible()

  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(
    page.getByRole('heading', { name: 'Zelda Game 1' }),
  ).toBeVisible()
})

test('show more adds the next page', async ({ page }) => {
  await stubSearch(page, (_q, pageNumber) => ({
    body: {
      games: makeGames(24, (pageNumber - 1) * 24),
      page: pageNumber,
      hasMore: pageNumber < 2,
    },
  }))
  await page.goto('/')

  await page.getByRole('searchbox', { name: 'Search games' }).fill('zelda')
  await expect(
    page.getByRole('heading', { name: 'Zelda Game 24' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Show more' }).click()

  await expect(
    page.getByRole('heading', { name: 'Zelda Game 48' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show more' })).toBeHidden()
})

test('keeps a search typed before the page finished loading', async ({
  page,
}) => {
  await stubSearch(page, (_q, pageNumber) => ({
    body: { games: makeGames(2), page: pageNumber, hasMore: false },
  }))
  let releaseScripts!: () => void
  const scriptsHeld = new Promise<void>((resolve) => (releaseScripts = resolve))
  await page.route('**/_nuxt/**', async (route) => {
    if (route.request().resourceType() === 'script') await scriptsHeld
    await route.continue()
  })

  await page.goto('/', { waitUntil: 'commit' })
  const box = page.getByRole('searchbox', { name: 'Search games' })
  await box.fill('zelda')
  releaseScripts()

  await expect(
    page.getByRole('heading', { name: 'Zelda Game 1' }),
  ).toBeVisible()
  await expect(box).toHaveValue('zelda')
})
