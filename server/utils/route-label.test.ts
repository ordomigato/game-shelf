import { describe, expect, it } from 'vitest'
import { routeLabel } from './route-label'

describe('routeLabel', () => {
  it('uses the API route Nitro matched', () => {
    expect(routeLabel('/api/games/1026', '/api/games/:id')).toBe(
      '/api/games/:id',
    )
  })

  it('drops the query string, which can hold search text', () => {
    expect(routeLabel('/?q=secret+game')).toBe('/')
    expect(routeLabel('/api/games/search?q=zelda')).toBe('/api/games/search')
  })

  it('groups pages by route, not by game, person or collection', () => {
    expect(routeLabel('/games/1026')).toBe('/games/:id')
    expect(routeLabel('/u/retro_fan')).toBe('/u/:username')
    expect(routeLabel('/u/retro_fan/shelf')).toBe('/u/:username/shelf')
    expect(routeLabel('/u/retro_fan/shelf/nes-games')).toBe(
      '/u/:username/shelf/:slug',
    )
    expect(routeLabel('/blueprints/20000000-0000-4000-8000-000000000011')).toBe(
      '/blueprints/:id',
    )
  })

  it('ignores catch-all matches, which say nothing about the page', () => {
    expect(routeLabel('/games/7', '/**')).toBe('/games/:id')
  })
})
