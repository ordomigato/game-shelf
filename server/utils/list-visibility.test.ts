import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const sets: Record<string, unknown>[] = []
vi.mock('./db', () => ({
  useDb: () => ({
    update: () => ({
      set: (values: Record<string, unknown>) => {
        sets.push(values)
        return { where: async () => undefined }
      },
    }),
  }),
}))

const { setListVisibility } = await import('./lists')

beforeEach(() => {
  sets.length = 0
})

describe('setListVisibility', () => {
  it('stamps the list’s time when it goes from private to public', async () => {
    await setListVisibility('u', 'owned', 'public')
    expect(sets[0]!.ownedPublic).toBe(true)
    expect(
      new PgDialect().sqlToQuery(sets[0]!.ownedUpdatedAt as never).sql,
    ).toBe('case when owned_public then owned_updated_at else now() end')
    expect(sets[0]).not.toHaveProperty('wishlistUpdatedAt')
  })

  it('does the same for the Wishlist', async () => {
    await setListVisibility('u', 'wishlist', 'public')
    expect(
      new PgDialect().sqlToQuery(sets[0]!.wishlistUpdatedAt as never).sql,
    ).toBe('case when wishlist_public then wishlist_updated_at else now() end')
  })

  it('leaves the time alone when a list goes private', async () => {
    await setListVisibility('u', 'owned', 'private')
    expect(sets[0]).toEqual({ ownedPublic: false })
  })
})
