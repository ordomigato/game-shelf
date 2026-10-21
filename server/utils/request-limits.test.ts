import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { clientIp, isWrite, limitGroupFor } from './request-limits'

const eventWith = (
  headers: Record<string, string>,
  remoteAddress?: string,
  sourceIp?: string,
) =>
  ({
    node: {
      req: {
        headers,
        socket: { remoteAddress },
        __unenv__: sourceIp
          ? { event: { requestContext: { http: { sourceIp } } } }
          : undefined,
      },
    },
  }) as unknown as H3Event

describe('limitGroupFor', () => {
  it('puts IGDB routes in their own group', () => {
    expect(limitGroupFor('GET', '/api/games/search?q=zelda')).toBe('igdb')
    expect(limitGroupFor('GET', '/api/games/123')).toBe('igdb')
    expect(limitGroupFor('GET', '/api/library-items/igdb/55')).toBe('igdb')
    expect(limitGroupFor('POST', '/api/import/match')).toBe('igdb')
  })

  it('treats the vitals beacon on its own', () => {
    expect(limitGroupFor('POST', '/api/vitals')).toBe('vitals')
  })

  it('puts public reads together, API and pages', () => {
    expect(limitGroupFor('GET', '/api/u/retro_fan/collections')).toBe('public')
    expect(limitGroupFor('GET', '/api/explore?page=2')).toBe('public')
    expect(limitGroupFor('GET', '/u/retro_fan/shelf/nes')).toBe('public')
  })

  it('counts changes as writes, or as backstop when signed in', () => {
    expect(limitGroupFor('DELETE', '/api/library-items/1')).toBe('write')
    expect(limitGroupFor('PATCH', '/api/me', true)).toBe('other')
  })

  it('backstops everything else, and skips build files', () => {
    expect(limitGroupFor('GET', '/api/me')).toBe('other')
    expect(limitGroupFor('GET', '/')).toBe('other')
    expect(limitGroupFor('GET', '/_nuxt/entry.js')).toBeNull()
  })

  it('counts only API requests as changes', () => {
    expect(isWrite('POST', '/login')).toBe(false)
    expect(isWrite('post', '/api/me')).toBe(true)
    expect(isWrite('GET', '/api/me')).toBe(false)
  })
})

describe('clientIp', () => {
  it('prefers the header the CloudFront function sets', () => {
    const event = eventWith(
      { 'x-viewer-ip': '203.0.113.7' },
      '10.0.0.1',
      '130.176.0.1',
    )
    expect(clientIp(event)).toBe('203.0.113.7')
  })

  it('falls back to the Lambda sourceIp, then the socket', () => {
    expect(clientIp(eventWith({}, '10.0.0.1', '198.51.100.2'))).toBe(
      '198.51.100.2',
    )
    expect(clientIp(eventWith({}, '::1'))).toBe('::1')
  })

  it('ignores a header that is not an address', () => {
    const event = eventWith({ 'x-viewer-ip': 'a; drop table' }, '10.0.0.1')
    expect(clientIp(event)).toBe('10.0.0.1')
  })

  it('is null when nothing says who is calling', () => {
    expect(clientIp(eventWith({}))).toBeNull()
  })
})
