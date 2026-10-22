import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('effectivePlan', () => 'free')
vi.stubGlobal('userLimits', () => ({}))

const { toMe, toPublicProfile } = await import('./users')

const row = (roles: string[]) =>
  ({
    id: '00000000-0000-4000-8000-000000000001',
    cognitoSub: 'sub-1',
    username: 'retro_fan',
    displayName: 'Retro Fan',
    roles,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }) as never

describe('toMe', () => {
  it("gives the user's own roles", () => {
    expect(toMe(row(['admin'])).roles).toEqual(['admin'])
    expect(toMe(row([])).roles).toEqual([])
  })

  it('no longer carries the old reviewer flag', () => {
    expect(toMe(row(['admin']))).not.toHaveProperty('reviewsBarcodes')
  })
})

describe('toPublicProfile', () => {
  it('never carries roles or anything else private', () => {
    expect(toPublicProfile(row(['admin']))).toEqual({
      username: 'retro_fan',
      displayName: 'Retro Fan',
      memberSince: '2026-01-01T00:00:00.000Z',
    })
  })
})
