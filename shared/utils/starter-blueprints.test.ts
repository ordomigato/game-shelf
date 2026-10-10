import { describe, expect, it } from 'vitest'
import { STARTER_BLUEPRINTS, starterFields } from './starter-blueprints'

describe('starterFields', () => {
  it('gives every field a fresh id each time', () => {
    const first = starterFields('collector')
    const second = starterFields('collector')
    const ids = [...first, ...second].map((field) => field.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('copies options, so editing one collection never changes another', () => {
    const first = starterFields('player')
    first.find((f) => f.type === 'select')!.options!.push('Replaying')
    const status = starterFields('player').find((f) => f.type === 'select')!
    expect(status.options).not.toContain('Replaying')
  })

  it('has a select field with options wherever a select is used', () => {
    for (const starter of [...STARTER_BLUEPRINTS, 'wishlist'] as const) {
      for (const field of starterFields(starter)) {
        if (field.type === 'select')
          expect(field.options?.length).toBeGreaterThan(0)
      }
    }
  })

  it('starts blank collections with no fields', () => {
    expect(starterFields('blank')).toEqual([])
  })

  it('starts the Wishlist with no fields', () => {
    expect(starterFields('wishlist')).toEqual([])
  })
})
