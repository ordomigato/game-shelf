import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Request timing reads Nitro's request context, which tests don't have.
vi.mock('./request-timing', () => ({ recordTiming: vi.fn() }))

vi.mock('sst', () => ({
  Resource: {
    TwitchClientId: { value: 'client-id' },
    TwitchClientSecret: { value: 'client-secret' },
  },
}))

type Route = (url: string) => Response | Promise<Response>

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
const tokenResponse = () =>
  json({ access_token: 'token-1', expires_in: 5_000_000 })

/** Loads a fresh copy of igdb.ts, so its token cache starts empty. */
async function loadIgdb() {
  vi.resetModules()
  return import('./igdb')
}

function mockFetch(igdb: Route[], token: Route = tokenResponse) {
  const responses = [...igdb]
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('id.twitch.tv')) return token(url)
    const next = responses.shift()
    if (!next) throw new Error('unexpected IGDB call')
    return next(url)
  })
}

function loggedEvents(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(
    (call) => (JSON.parse(call[0] as string) as { event: string }).event,
  )
}

let info: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  info = vi.spyOn(console, 'log').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('igdbRequest', () => {
  it('returns IGDB data and logs only the token fetch', async () => {
    const { igdbRequest } = await loadIgdb()
    mockFetch([() => json([{ id: 1 }])])

    await expect(igdbRequest('games', 'fields name;')).resolves.toEqual([
      { id: 1 },
    ])
    expect(loggedEvents(info)).toEqual(['twitch.token_fetched'])
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('retries once with a new token when IGDB rejects the token', async () => {
    const { igdbRequest } = await loadIgdb()
    const fetchSpy = mockFetch([
      () => json({ message: 'Unauthorized' }, 401),
      () => json([{ id: 1 }]),
    ])

    await expect(igdbRequest('games', 'fields name;')).resolves.toEqual([
      { id: 1 },
    ])
    expect(loggedEvents(warn)).toEqual(['igdb.token_rejected'])
    const tokenCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('id.twitch.tv'),
    )
    expect(tokenCalls).toHaveLength(2)
  })

  it('throws 503 and logs when IGDB rate-limits us', async () => {
    const { igdbRequest } = await loadIgdb()
    mockFetch([() => json({}, 429)])

    await expect(igdbRequest('games', 'fields name;')).rejects.toMatchObject({
      statusCode: 503,
    })
    expect(loggedEvents(warn)).toEqual(['igdb.rate_limited'])
  })

  it('throws 502 and logs the status when IGDB fails', async () => {
    const { igdbRequest } = await loadIgdb()
    mockFetch([() => json({ secret: 'not for the browser' }, 500)])

    const failure: unknown = await igdbRequest('games', 'fields name;').catch(
      (e: unknown) => e,
    )
    expect(failure).toMatchObject({ statusCode: 502 })
    expect((failure as { data?: unknown }).data).toBeUndefined()
    expect(JSON.stringify(failure)).not.toContain('not for the browser')
    const [line] = error.mock.calls[0] as [string]
    expect(JSON.parse(line)).toMatchObject({
      event: 'igdb.request_failed',
      endpoint: 'games',
      status: 500,
    })
  })

  it('logs slow responses', async () => {
    const { igdbRequest, SLOW_IGDB_MS } = await loadIgdb()
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    mockFetch([
      () => {
        now += SLOW_IGDB_MS + 1
        return json([])
      },
    ])

    await igdbRequest('games', 'fields name;')
    expect(loggedEvents(warn)).toEqual(['igdb.slow'])
  })

  it('logs and throws 502 when Twitch refuses a token', async () => {
    const { igdbRequest } = await loadIgdb()
    mockFetch([], () => json({ message: 'invalid client' }, 400))

    await expect(igdbRequest('games', 'fields name;')).rejects.toMatchObject({
      statusCode: 502,
    })
    expect(loggedEvents(error)).toEqual(['twitch.token_failed'])
  })

  it('never logs the token, secret or query', async () => {
    const { igdbRequest } = await loadIgdb()
    mockFetch([() => json({}, 500)])

    await igdbRequest('games', 'search "my secret search";').catch(() => {})
    const everything = [info, warn, error]
      .flatMap((spy) =>
        spy.mock.calls.map((call: unknown[]) => String(call[0])),
      )
      .join('\n')
    expect(everything).not.toContain('token-1')
    expect(everything).not.toContain('client-secret')
    expect(everything).not.toContain('my secret search')
  })
})
