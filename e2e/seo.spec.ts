import { expect, test } from './fixtures'

test('pages tell search engines and link previews what the site is', async ({
  request,
  baseURL,
}) => {
  const html = await (await request.get('/')).text()
  expect(html).toContain(
    '<meta name="description" content="Search games, track your collection and share your collections.">',
  )
  expect(html).toContain(`<link rel="canonical" href="${baseURL}/">`)
  expect(html).toContain(
    `<meta property="og:image" content="${baseURL}/og.png">`,
  )
  expect(html).toContain(
    '<meta name="twitter:card" content="summary_large_image">',
  )
  expect(html).toContain('"@type":"SearchAction"')
  expect(html).toContain('rel="icon" href="/favicon.svg"')
})

test('the canonical link leaves out the search', async ({
  request,
  baseURL,
}) => {
  const html = await (await request.get('/explore?page=2')).text()
  expect(html).toContain(`<link rel="canonical" href="${baseURL}/explore">`)
})

test('sign-in and account pages stay out of search results', async ({
  request,
}) => {
  for (const path of [
    '/login',
    '/signup',
    '/account/settings',
    '/account/fields',
  ]) {
    const response = await request.get(path)
    expect(response.headers()['x-robots-tag'], path).toBe('noindex')
  }
  const home = await request.get('/')
  expect(home.headers()['x-robots-tag']).toBeUndefined()
})

test('the share image and icons are there', async ({ request }) => {
  for (const path of [
    '/og.png',
    '/favicon.svg',
    '/favicon.ico',
    '/apple-touch-icon.png',
  ]) {
    expect((await request.get(path)).status(), path).toBe(200)
  }
})

test('www goes to the bare domain, keeping the path', async ({ request }) => {
  const response = await request.get('/explore?page=2', {
    headers: { 'x-forwarded-host': 'www.thisplayshelf.com' },
    maxRedirects: 0,
  })
  expect(response.status()).toBe(301)
  expect(response.headers().location).toBe(
    'https://thisplayshelf.com/explore?page=2',
  )
})
