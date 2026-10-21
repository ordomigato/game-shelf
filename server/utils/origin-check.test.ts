import { describe, expect, it } from 'vitest'
import { originAllowed } from './origin-check'

describe('originAllowed', () => {
  it('allows the right secret', () => {
    expect(originAllowed('s3cret', 's3cret')).toBe(true)
  })

  it('refuses a missing or wrong header, whatever its length', () => {
    expect(originAllowed('s3cret', undefined)).toBe(false)
    expect(originAllowed('s3cret', '')).toBe(false)
    expect(originAllowed('s3cret', 's3cre')).toBe(false)
    expect(originAllowed('s3cret', 's3cret-and-more')).toBe(false)
  })

  it('refuses everything when no secret is configured', () => {
    expect(originAllowed('', '')).toBe(false)
    expect(originAllowed('', 'anything')).toBe(false)
  })
})
