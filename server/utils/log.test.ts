import { afterEach, describe, expect, it, vi } from 'vitest'
import { log } from './log'

afterEach(() => vi.restoreAllMocks())

describe('log', () => {
  it('writes one JSON line with level, event, time and fields', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {})
    log('info', 'twitch.token_fetched', { forced: false })

    expect(out).toHaveBeenCalledTimes(1)
    const entry = JSON.parse(out.mock.calls[0]![0] as string)
    expect(entry).toMatchObject({
      level: 'info',
      event: 'twitch.token_fetched',
      forced: false,
    })
    expect(Number.isNaN(Date.parse(entry.time))).toBe(false)
  })

  it('sends warnings and errors to the matching console method', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    log('warn', 'igdb.slow')
    log('error', 'igdb.request_failed')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
  })
})
