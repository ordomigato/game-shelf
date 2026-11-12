import { beforeEach, describe, expect, it, vi } from 'vitest'

const sets: Record<string, unknown>[] = []

vi.stubGlobal('useDb', () => ({
  update: () => ({
    set: (values: Record<string, unknown>) => {
      sets.push(values)
      return { where: async () => undefined }
    },
  }),
}))

const { touchLists } = await import('./list-activity')

beforeEach(() => {
  sets.length = 0
})

describe('touchLists', () => {
  it('touches Owned for a game on Owned', async () => {
    await touchLists('u', { owned: true, wishlisted: false })
    expect(Object.keys(sets[0]!)).toEqual(['ownedUpdatedAt'])
  })

  it('touches the Wishlist for a game on the Wishlist', async () => {
    await touchLists('u', { owned: false, wishlisted: true })
    expect(Object.keys(sets[0]!)).toEqual(['wishlistUpdatedAt'])
  })

  it('touches both lists when the game moved from one to the other', async () => {
    await touchLists(
      'u',
      { owned: true, wishlisted: false },
      { owned: false, wishlisted: true },
    )
    expect(Object.keys(sets[0]!).sort()).toEqual([
      'ownedUpdatedAt',
      'wishlistUpdatedAt',
    ])
  })

  it('writes nothing when no game is on a list', async () => {
    await touchLists('u')
    expect(sets).toHaveLength(0)
  })
})
