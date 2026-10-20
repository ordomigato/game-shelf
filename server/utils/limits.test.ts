import { describe, expect, it, vi } from 'vitest'
import { LIMIT_REACHED, PLAN_LIMITS, limitsFor } from '../../shared/utils/plans'
import { assertFieldRoom, limitReached } from './limits'

// Nitro auto-imports this in the server.
vi.stubGlobal('LIMIT_REACHED', LIMIT_REACHED)

const fields = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => ({ id: `f${from + i}` }))
const free = limitsFor('free')

describe('assertFieldRoom', () => {
  it('allows fields up to the plan’s limit', () => {
    expect(() => assertFieldRoom(fields(3), fields(5), free)).not.toThrow()
    expect(PLAN_LIMITS.free.fields).toBe(5)
  })

  it('refuses a new field past the limit, with the limit in the message', () => {
    expect(() => assertFieldRoom(fields(5), fields(6), free)).toThrow(
      expect.objectContaining({
        statusCode: 403,
        data: { key: 'limits.reached.fields', params: { limit: 5 } },
      }),
    )
  })

  it('lets an account over the limit keep, edit and remove its fields', () => {
    const over = fields(8)
    expect(() => assertFieldRoom(over, over, free)).not.toThrow()
    expect(() => assertFieldRoom(over, over.slice(2), free)).not.toThrow()
  })

  it('refuses adding to an account already over the limit', () => {
    expect(() => assertFieldRoom(fields(8), fields(9, 0), free)).toThrow(
      expect.objectContaining({ statusCode: 403 }),
    )
  })

  it('counts a replaced field as an addition only when over the limit', () => {
    expect(() =>
      assertFieldRoom(fields(5), [...fields(4), { id: 'new' }], free),
    ).not.toThrow()
  })
})

describe('limitReached', () => {
  it('names the games limit apart from a collection’s', () => {
    expect(() => limitReached('games', 3000)).toThrow(
      expect.objectContaining({
        data: { key: 'limits.reached.games', params: { limit: 3000 } },
      }),
    )
    expect(() => limitReached('gamesPerCollection', 100)).toThrow(
      expect.objectContaining({
        data: {
          key: 'limits.reached.gamesPerCollection',
          params: { limit: 100 },
        },
      }),
    )
  })
})

describe('assertLibraryRoom', () => {
  // A stand-in database that remembers the condition it was asked about
  // and answers with a count of the library's rows.
  async function room(rows: number, adding: number, limit: number) {
    let where: unknown
    vi.resetModules()
    vi.stubGlobal('useDb', () => ({
      select: () => ({
        from: () => ({
          where: async (condition: unknown) => {
            where = condition
            return [{ n: rows }]
          },
        }),
      }),
    }))
    const { assertLibraryRoom } = await import('./limits')
    const { PgDialect } = await import('drizzle-orm/pg-core')
    const result = assertLibraryRoom('o', adding, { ...free, games: limit })
    await result.catch(() => {})
    return {
      result,
      sql: where ? new PgDialect().sqlToQuery(where as never).sql : '',
    }
  }

  it('counts every library row once, owned or wishlisted', async () => {
    // One row per game, so a game on both lists counts once.
    const { sql } = await room(0, 1, 10)
    expect(sql).toContain('"owner_id" = $')
    expect(sql).not.toContain('"owned"')
    expect(sql).not.toContain('wishlisted')
  })

  it('allows a new game up to the limit and refuses the next', async () => {
    await expect((await room(9, 1, 10)).result).resolves.toBeUndefined()
    await expect((await room(10, 1, 10)).result).rejects.toMatchObject({
      statusCode: 403,
      data: { key: 'limits.reached.games', params: { limit: 10 } },
    })
  })

  it('refuses a new wishlisted game once the library is full', async () => {
    // For example 1500 owned and 1500 wishlisted.
    await expect((await room(3000, 1, 3000)).result).rejects.toMatchObject({
      statusCode: 403,
    })
    await expect((await room(2999, 1, 3000)).result).resolves.toBeUndefined()
  })

  it('needs no room to add nothing', async () => {
    await expect((await room(10, 0, 10)).result).resolves.toBeUndefined()
  })
})
