import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import {
  clientIp,
  clientKey,
  hasBearerToken,
  isWrite,
  limitGroupFor,
  normalizePath,
} from './request-limits'

const eventWith = (headers: Record<string, string>, remoteAddress?: string) =>
  ({
    node: { req: { headers, socket: { remoteAddress } } },
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
  })

  it('counts only API requests as changes', () => {
    expect(isWrite('POST', '/login')).toBe(false)
    expect(isWrite('post', '/api/me')).toBe(true)
    expect(isWrite('GET', '/api/me')).toBe(false)
  })
})

describe('limitGroupFor edge cases', () => {
  it('skips real build files and the icon, not look-alikes', () => {
    expect(limitGroupFor('GET', '/_nuxt/entry.js')).toBeNull()
    expect(limitGroupFor('GET', '/_ipx/w_100/x.png')).toBeNull()
    expect(limitGroupFor('GET', '/favicon.ico')).toBeNull()
    expect(limitGroupFor('GET', '/_nuxtx')).toBe('other')
    expect(limitGroupFor('GET', '/favicon-fan')).toBe('other')
  })

  it('sees through a trailing slash and repeated slashes', () => {
    expect(limitGroupFor('POST', '/api/vitals/')).toBe('vitals')
    expect(limitGroupFor('POST', '//api//vitals')).toBe('vitals')
    expect(limitGroupFor('POST', '/api//me/')).toBe('write')
    expect(limitGroupFor('GET', '/api/games//search/')).toBe('igdb')
    expect(normalizePath('/a//b/?q=1')).toBe('/a/b')
    expect(normalizePath('/')).toBe('/')
  })

  it('only lets a well-formed token move a change out of the write group', () => {
    const jwt = 'Bearer aaa.bbb-1.ccc_2'
    expect(hasBearerToken(jwt)).toBe(true)
    expect(hasBearerToken('x')).toBe(false)
    expect(hasBearerToken('Bearer x')).toBe(false)
    expect(hasBearerToken(undefined)).toBe(false)
    expect(limitGroupFor('PATCH', '/api/me', hasBearerToken(jwt))).toBe('other')
    expect(limitGroupFor('PATCH', '/api/me', hasBearerToken('x'))).toBe('write')
  })
})

describe('clientKey', () => {
  it('leaves IPv4 alone and unwraps IPv4-mapped IPv6', () => {
    expect(clientKey('203.0.113.7')).toBe('203.0.113.7')
    expect(clientKey('::ffff:203.0.113.7')).toBe('203.0.113.7')
  })

  it('files IPv6 under its /64, however it is written', () => {
    const a = clientKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')
    expect(a).toBe('2001:db8:1:2::/64')
    expect(clientKey('2001:DB8:1:2::1')).toBe(a)
    expect(clientKey('2001:0db8:0001:0002:0:0:0:9')).toBe(a)
    expect(clientKey('2001:db8:1:3::1')).not.toBe(a)
  })

  it('expands :: at the start and in the middle', () => {
    expect(clientKey('::1')).toBe('0:0:0:0::/64')
    expect(clientKey('2001:db8::5')).toBe('2001:db8:0:0::/64')
  })
})

describe('clientIp', () => {
  it('prefers the header the CloudFront function sets', () => {
    const event = eventWith({ 'x-viewer-ip': '203.0.113.7' }, '10.0.0.1')
    expect(clientIp(event)).toBe('203.0.113.7')
  })

  it('reads the viewer from a header the server forwarded to itself', () => {
    // event.$fetch passes the visitor's headers on, so page renders that call
    // the API count as the visitor and never as an unknown client.
    expect(clientIp(eventWith({ 'x-viewer-ip': '2001:db8::5' }))).toBe(
      '2001:db8::5',
    )
  })

  it('falls back to the connection address', () => {
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
