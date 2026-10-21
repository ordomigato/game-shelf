import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('sst', () => ({ Resource: { ScanDexToken: { value: 'secret' } } }))
const log = vi.fn()
vi.mock('./log', () => ({ log }))

const { submitToScanDex } = await import('./scandex')

const suggestion = {
  igdbId: 26758,
  platformId: 130,
  platform: 'Nintendo Switch',
  name: 'Super Mario Odyssey',
  value: 45496590048,
}

afterEach(() => {
  vi.unstubAllGlobals()
  log.mockReset()
})

describe('submitToScanDex', () => {
  it('posts the five fields as JSON with the bearer token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await submitToScanDex(suggestion)).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://scandex.gamery.app/api/v2/create')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer secret',
    )
    expect(JSON.parse(init.body as string)).toEqual({
      igdb_id: 26758,
      platform_id: 130,
      platform: 'Nintendo Switch',
      name: 'Super Mario Odyssey',
      value: 45496590048,
    })
  })

  it('treats a non-2xx as a failure and logs only the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 422 })),
    )
    expect(await submitToScanDex(suggestion)).toBe(false)
    expect(log).toHaveBeenCalledWith('warn', 'barcode.suggest_failed', {
      status: 422,
    })
  })

  it('treats a network error or timeout as a failure, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    expect(await submitToScanDex(suggestion)).toBe(false)
  })
})
