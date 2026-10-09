import { describe, expect, it } from 'vitest'
import { safeRedirect } from './redirect'

describe('safeRedirect', () => {
  it('allows paths on this site', () => {
    expect(safeRedirect('/account')).toBe('/account')
    expect(safeRedirect('/?q=zelda')).toBe('/?q=zelda')
  })

  it('rejects anything that could leave the site', () => {
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect('//evil.example')).toBe('/')
    expect(safeRedirect('/\\evil.example')).toBe('/')
    expect(safeRedirect('javascript:alert(1)')).toBe('/')
    expect(safeRedirect(['/account'])).toBe('/')
    expect(safeRedirect(undefined, '/welcome')).toBe('/welcome')
  })
})
