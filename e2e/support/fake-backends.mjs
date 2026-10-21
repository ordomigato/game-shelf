/**
 * Loaded into the E2E server only (node --import), so the server's own
 * calls to IGDB, Twitch and the database get answers, as they would in
 * production. A browser test can stub those with page.route, but a page
 * fetched with `request` is built on the server, out of Playwright's reach.
 *
 * Only the few calls the tests need are answered. Any other database query
 * fails, as it did before the server had a database to talk to.
 */
const realFetch = globalThis.fetch

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const zelda = {
  id: 1026,
  name: 'The Legend of Zelda: A Link to the Past',
  summary: 'Venture back to Hyrule.',
  url: 'https://www.igdb.com/games/the-legend-of-zelda-a-link-to-the-past',
  first_release_date: 690_681_600,
  release_dates: [{ date: 690_681_600, date_format: 0 }],
  cover: { image_id: 'co3vzl' },
  platforms: [{ name: 'Super Nintendo Entertainment System' }, { name: 'Wii' }],
  genres: [{ name: 'Puzzle' }, { name: 'Adventure' }],
  involved_companies: [
    { company: { name: 'Nintendo EAD' }, developer: true, publisher: false },
  ],
  screenshots: [],
}

const TEXT = 25
const INT = 23
const BOOL = 16
const TIMESTAMP = 1184
const fields = (...columns) =>
  columns.map(([name, dataTypeID]) => ({ name, dataTypeID }))

/**
 * The database as the sitemap sees it. The users and collections include
 * private ones on purpose: the query would have left them out, and the
 * sitemap must leave them out even if it didn't.
 */
function database(query) {
  if (query.includes('select igdb_id from games')) {
    return {
      fields: fields(['igdb_id', INT]),
      rows: [['1026'], ['7346']],
    }
  }
  if (query.includes('as has_owned')) {
    return {
      fields: fields(
        ['username', TEXT],
        ['owned_public', BOOL],
        ['wishlist_public', BOOL],
        ['has_owned', BOOL],
        ['has_wishlist', BOOL],
      ),
      rows: [
        ['retro_fan', 't', 'f', 't', 't'],
        ['private_pat', 'f', 'f', 't', 't'],
      ],
    }
  }
  if (query.includes('as lastmod')) {
    return {
      fields: fields(
        ['username', TEXT],
        ['slug', TEXT],
        ['visibility', TEXT],
        ['item_count', INT],
        ['lastmod', TIMESTAMP],
      ),
      rows: [
        ['retro_fan', 'nes-games', 'public', '12', '2026-10-01 12:00:00+00'],
        ['retro_fan', 'secret-stash', 'private', '3', null],
        ['private_pat', 'hidden', 'private', '9', null],
      ],
    }
  }
  return null
}

globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  )
  const body = typeof init?.body === 'string' ? init.body : ''
  if (url.host === 'id.twitch.tv') {
    return json({ access_token: 'e2e', expires_in: 5_000_000 })
  }
  if (url.host === 'api.igdb.com') {
    return json(body.includes('where id = 1026;') ? [zelda] : [])
  }
  if (url.host.endsWith('neon.test')) {
    const result = database(JSON.parse(body).query)
    if (!result) return json({ message: 'Not answered by the E2E server' }, 400)
    return json({
      command: 'SELECT',
      rowCount: result.rows.length,
      rowAsArray: true,
      ...result,
    })
  }
  return realFetch(input, init)
}
