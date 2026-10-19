import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanLimits } from '../../shared/utils/plans'

const calls: string[] = []
let current: string[] = []
let after: string[] = []
let owned: string[] = []
let rooms: { ids: string[]; adding: number }[] = []
let inserted: unknown[] = []

class Statement {
  constructor(readonly kind: string) {}
  values(rows: unknown[]) {
    inserted = rows
    return this
  }
  where() {
    return this
  }
  onConflictDoNothing() {
    return this
  }
  then(resolve: (value: unknown) => void) {
    calls.push(this.kind)
    resolve(undefined)
  }
}

vi.mock('./db', () => ({
  useDb: () => ({
    delete: () => new Statement('delete'),
    insert: () => new Statement('insert'),
    batch: async (statements: Statement[]) => {
      calls.push(`batch ${statements.map((s) => s.kind).join('+')}`)
    },
  }),
}))
vi.mock('./collections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./collections')>()),
  getOwnedItem: async () => ({}),
  assertOwnsCollections: async (_owner: string, ids: string[]) => {
    calls.push('owns')
    if (ids.some((id) => !owned.includes(id))) {
      throw Object.assign(new Error('Not found'), { statusCode: 404 })
    }
  },
  collectionIdsForItem: async () =>
    calls.some((call) => /insert|delete/.test(call)) ? after : current,
  lastPositions: async () => new Map([['b', 4]]),
}))
vi.mock('./limits', () => ({
  assertCollectionsRoom: async (ids: string[], adding: number) => {
    calls.push('room')
    rooms.push({ ids, adding })
  },
}))

const { setItemCollections } = await import('./item-collections')

const limits = {} as PlanLimits

beforeEach(() => {
  calls.length = 0
  current = []
  after = []
  owned = ['a', 'b', 'c']
  rooms = []
  inserted = []
})

describe('setItemCollections', () => {
  it('joins and leaves in one batch, checking room only for the joins', async () => {
    current = ['a', 'c']
    after = ['b', 'c']
    const result = await setItemCollections(
      'u',
      'i',
      { add: ['b', 'c'], remove: ['a'] },
      limits,
    )
    expect(result).toEqual(['b', 'c'])
    expect(rooms).toEqual([{ ids: ['b'], adding: 1 }])
    expect(calls).toEqual(['owns', 'room', 'batch delete+insert'])
    expect(inserted).toEqual([{ collectionId: 'b', itemId: 'i', position: 5 }])
  })

  it('only deletes when the game just leaves', async () => {
    current = ['a', 'b']
    after = ['a']
    await setItemCollections('u', 'i', { add: [], remove: ['b'] }, limits)
    expect(calls).toEqual(['owns', 'room', 'delete'])
  })

  it('only inserts when the game just joins', async () => {
    after = ['a']
    await setItemCollections('u', 'i', { add: ['a'], remove: [] }, limits)
    expect(calls).toEqual(['owns', 'room', 'insert'])
  })

  it('needs no room to join what it is in, and leaving what it is not in is harmless', async () => {
    current = ['a']
    after = ['a']
    const result = await setItemCollections(
      'u',
      'i',
      { add: ['a'], remove: ['b'] },
      limits,
    )
    expect(result).toEqual(['a'])
    expect(rooms).toEqual([{ ids: [], adding: 1 }])
    expect(calls).toEqual(['owns', 'room', 'delete'])
  })

  it('keeps a link the page did not know about', async () => {
    // Another tab put the game in "x". This page only asks for "b".
    current = ['a', 'x']
    after = ['a', 'x', 'b']
    owned = ['a', 'b', 'c', 'x']
    const result = await setItemCollections(
      'u',
      'i',
      { add: ['b'], remove: [] },
      limits,
    )
    expect(calls).toEqual(['owns', 'room', 'insert'])
    expect(inserted).toEqual([{ collectionId: 'b', itemId: 'i', position: 5 }])
    expect(result).toEqual(['a', 'x', 'b'])
  })

  it('answers 404 for a collection that is not the user’s, before any limit', async () => {
    await expect(
      setItemCollections('u', 'i', { add: ['a'], remove: ['zzz'] }, limits),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(calls).toEqual(['owns'])
  })
})
