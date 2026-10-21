import { describe, expect, it, vi } from 'vitest'

// Nitro auto-imports this in the server.
vi.stubGlobal(
  'createError',
  (input: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input),
)

// The add route calls addItemToCollections after its checks. The game or a
// collection can be deleted in between, which Postgres reports as a
// foreign-key violation on the insert. A stand-in database stands for that
// race: the ownership and position reads succeed, then the insert fails.
async function addWith(insertError: unknown) {
  vi.resetModules()
  vi.stubGlobal('useDb', () => ({
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve([{ id: 'c1' }]), {
            groupBy: async () => [],
          }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: async () => {
          if (insertError) throw insertError
        },
      }),
    }),
  }))
  const { addItemToCollections } = await import('./collections')
  return addItemToCollections('owner', 'item', ['c1'])
}

describe('addItemToCollections', () => {
  it('answers 404 when the game was deleted while it was being added', async () => {
    await expect(addWith({ code: '23503' })).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('answers 404 when the error is wrapped by the database driver', async () => {
    await expect(
      addWith(new Error('failed query', { cause: { code: '23503' } })),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('lets any other database error through', async () => {
    await expect(addWith(new Error('boom'))).rejects.toThrow('boom')
  })

  it('adds the game when nothing was deleted', async () => {
    await expect(addWith(null)).resolves.toBeUndefined()
  })
})
