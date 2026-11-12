import { describe, expect, it } from 'vitest'
import { timeAgo } from './time-ago'

const now = new Date('2026-11-12T12:00:00Z')

describe('timeAgo', () => {
  it('uses the largest whole unit', () => {
    expect(timeAgo('2026-11-12T10:00:00Z', now, 'en')).toBe('2 hours ago')
    expect(timeAgo('2026-11-12T11:30:00Z', now, 'en')).toBe('30 minutes ago')
    expect(timeAgo('2026-11-09T12:00:00Z', now, 'en')).toBe('3 days ago')
  })

  it('says yesterday for the day before', () => {
    expect(timeAgo('2026-11-11T11:00:00Z', now, 'en')).toBe('yesterday')
  })

  it('says now for anything under a minute, or in the future', () => {
    expect(timeAgo('2026-11-12T11:59:30Z', now, 'en')).toBe('now')
    expect(timeAgo('2026-11-12T12:05:00Z', now, 'en')).toBe('now')
  })
})
