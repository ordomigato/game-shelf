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
  code: '0045496590048',
}

afterEach(() => {
  vi.unstubAllGlobals()
  log.mockReset()
})

describe('submitToScanDex', () => {
  it('posts the five fields in the address and as a form, with the bearer token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await submitToScanDex(suggestion)).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const fields = {
      igdb_id: '26758',
      platform_id: '130',
      platform: 'Nintendo Switch',
      name: 'Super Mario Odyssey',
      value: suggestion.code,
    }
    const sent = new URL(url)
    expect(sent.origin + sent.pathname).toBe(
      'https://scandex.gamery.app/api/v2/create',
    )
    expect(Object.fromEntries(sent.searchParams)).toEqual(fields)
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret')
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual(fields)
    expect(suggestion.code.startsWith('0')).toBe(true)
  })

  it('returns the status and ScanDex’s message for a non-2xx, and logs the message with every digit masked', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ message: 'Bad value 45496590048 for game 26758' }),
            { status: 400 },
          ),
        ),
    )
    expect(await submitToScanDex(suggestion)).toEqual({
      ok: false,
      status: 400,
      message: 'Bad value 45496590048 for game 26758',
    })
    expect(log).toHaveBeenCalledWith('warn', 'barcode.suggest_failed', {
      status: 400,
      message: 'Bad value ########### for game #####',
    })
    const logged = JSON.stringify(log.mock.calls)
    expect(logged).not.toContain('45496590048')
    expect(logged).not.toContain('26758')
    expect(logged).not.toContain('Super Mario')
  })

  it('keeps plain-text errors too, trimmed to about 200 characters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('x'.repeat(500), { status: 422 })),
    )
    const result = await submitToScanDex(suggestion)
    expect(result).toMatchObject({ ok: false, status: 422 })
    expect((result as { message: string }).message).toHaveLength(200)
  })

  it('has no message when ScanDex says nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    )
    expect(await submitToScanDex(suggestion)).toEqual({
      ok: false,
      status: 500,
      message: null,
    })
    expect(log).toHaveBeenCalledWith('warn', 'barcode.suggest_failed', {
      status: 500,
    })
  })

  it('treats a network error or timeout as a failure with status 0, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    expect(await submitToScanDex(suggestion)).toEqual({
      ok: false,
      status: 0,
      message: null,
    })
  })
})
