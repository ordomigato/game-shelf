import { expect, test } from './fixtures'

/**
 * What search engines and link previews read from the HTML the server
 * sends. Fetched with `request` rather than the browser, since a crawler
 * runs no scripts. The server's calls to IGDB and the database are answered
 * by e2e/support/fake-backends.mjs.
 */

/** The page's structured data blocks. */
function jsonLd(html: string): Record<string, unknown>[] {
  return [
    ...html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs,
    ),
  ].map((match) => JSON.parse(match[1]!))
}

const meta = (html: string, attribute: string, name: string) =>
  html.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`))?.[1]

test('the home page names the site, its logo and its search', async ({
  request,
  baseURL,
}) => {
  const html = await (await request.get('/')).text()
  const [data] = jsonLd(html)
  const graph = data!['@graph'] as Record<string, unknown>[]
  expect(graph.map((node) => node['@type'])).toEqual([
    'WebSite',
    'Organization',
  ])
  expect(graph[1]).toMatchObject({ logo: `${baseURL}/apple-touch-icon.png` })
  expect(meta(html, 'property', 'og:image:width')).toBe('1200')
  expect(meta(html, 'property', 'og:image:height')).toBe('630')
  expect(meta(html, 'property', 'og:image:alt')).toContain('ThisPlayShelf logo')
  expect(meta(html, 'property', 'og:title')).toBeTruthy()
  expect(meta(html, 'property', 'og:url')).toBe(`${baseURL}/`)
  expect(meta(html, 'property', 'og:type')).toBe('website')
  expect(meta(html, 'property', 'og:site_name')).toBe('ThisPlayShelf')
  expect(meta(html, 'name', 'robots')).toBeUndefined()
})

test('search results stay out of the index and point to the home page', async ({
  request,
  baseURL,
}) => {
  const html = await (await request.get('/?q=zelda')).text()
  expect(html).toContain(`<link rel="canonical" href="${baseURL}/">`)
  expect(meta(html, 'name', 'robots')).toBe('noindex, follow')
})

test('a game page has its details for search engines and link previews', async ({
  request,
  baseURL,
}) => {
  const response = await request.get('/games/1026')
  expect(response.status()).toBe(200)
  expect(response.headers()['x-robots-tag']).toBeUndefined()
  const html = await response.text()
  const cover =
    'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co3vzl.jpg'

  expect(html).toContain(`<link rel="canonical" href="${baseURL}/games/1026">`)
  const description = meta(html, 'name', 'description')!
  expect(description).toBe(
    'The Legend of Zelda: A Link to the Past (1991): Puzzle, Adventure. Track it in your ThisPlayShelf collection.',
  )
  expect(description.length).toBeGreaterThanOrEqual(50)
  expect(description.length).toBeLessThanOrEqual(160)
  expect(meta(html, 'property', 'og:title')).toBe(
    'The Legend of Zelda: A Link to the Past',
  )
  expect(meta(html, 'property', 'og:description')).toBe(description)
  expect(meta(html, 'property', 'og:url')).toBe(`${baseURL}/games/1026`)
  expect(meta(html, 'property', 'og:image')).toBe(cover)
  expect(meta(html, 'property', 'og:image:width')).toBe('528')
  expect(meta(html, 'property', 'og:image:height')).toBe('748')
  expect(meta(html, 'property', 'og:image:alt')).toBe(
    'Cover of The Legend of Zelda: A Link to the Past',
  )
  expect(meta(html, 'property', 'og:type')).toBe('website')
  expect(meta(html, 'property', 'og:site_name')).toBe('ThisPlayShelf')
  expect(meta(html, 'name', 'twitter:card')).toBe('summary')

  const [game] = jsonLd(html)
  expect(game).toEqual({
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: 'The Legend of Zelda: A Link to the Past',
    url: `${baseURL}/games/1026`,
    image: cover,
    description: 'Venture back to Hyrule.',
    datePublished: '1991-11-21',
    genre: ['Puzzle', 'Adventure'],
    gamePlatform: ['Super Nintendo Entertainment System', 'Wii'],
  })
})

test('CloudFront may keep a game’s data but not its page', async ({
  request,
}) => {
  // The page draws the signed-in layout from a cookie, so it differs by viewer.
  const page = await request.get('/games/1026')
  expect(page.headers()['cache-control']).toBeUndefined()
  const data = await request.get('/api/games/1026')
  expect(data.headers()['cache-control']).toBe(
    's-maxage=86400, stale-while-revalidate=604800',
  )
})

test('robots.txt points to the sitemap', async ({ request, baseURL }) => {
  const response = await request.get('/robots.txt')
  expect(response.headers()['content-type']).toContain('text/plain')
  const text = await response.text()
  expect(text).toContain('Disallow: /api/')
  expect(text).toContain(`Sitemap: ${baseURL}/sitemap.xml`)
})

test('the sitemap is valid XML that lists only public pages', async ({
  page,
  request,
  baseURL,
}) => {
  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/xml')
  expect(response.headers()['cache-control']).toBe(
    'public, s-maxage=14400, stale-while-revalidate=86400',
  )
  const xml = await response.text()

  const problem = await page.evaluate(
    (text) =>
      new DOMParser()
        .parseFromString(text, 'application/xml')
        .querySelector('parsererror')?.textContent ?? null,
    xml,
  )
  expect(problem).toBeNull()

  const urls = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])
  expect(urls).toEqual([
    `${baseURL}/`,
    `${baseURL}/explore`,
    `${baseURL}/about`,
    `${baseURL}/pricing`,
    `${baseURL}/privacy`,
    `${baseURL}/contact`,
    `${baseURL}/games/1026`,
    `${baseURL}/games/7346`,
    `${baseURL}/u/retro_fan/shelf`,
    `${baseURL}/u/retro_fan/shelf/owned`,
    `${baseURL}/u/retro_fan/shelf/nes-games`,
  ])
  expect(xml).toContain('<lastmod>2026-10-01T12:00:00.000Z</lastmod>')
  expect(xml).not.toMatch(/secret|private_pat|hidden|wishlist/)
})

test('a sitemap file by number exists only as far as the pages go', async ({
  request,
}) => {
  expect((await request.get('/sitemaps/1.xml')).status()).toBe(200)
  expect((await request.get('/sitemaps/2.xml')).status()).toBe(404)
})

test('a sitemap asked for with a query goes to the bare address', async ({
  request,
}) => {
  for (const path of ['/sitemap.xml', '/sitemaps/1.xml']) {
    const response = await request.get(`${path}?x=1`, { maxRedirects: 0 })
    expect(response.status()).toBe(301)
    expect(response.headers().location).toBe(path)
  }
})

test('the home page keeps tracking parameters indexable', async ({
  request,
  baseURL,
}) => {
  const html = await (await request.get('/?utm_source=x')).text()
  expect(html).toContain(`<link rel="canonical" href="${baseURL}/">`)
  expect(meta(html, 'name', 'robots')).toBeUndefined()
})
