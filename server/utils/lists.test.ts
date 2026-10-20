import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanLimits } from '../../shared/utils/plans'

const reads: unknown[] = []
const deleteResults: unknown[][] = []
const updateResults: unknown[][] = []
const written: unknown[] = []
let deletes = 0

vi.mock('./db', () => ({
  useDb: () => ({
    delete: () => ({
      where: () => ({
        returning: async () => {
          deletes += 1
          return deleteResults.shift() ?? []
        },
      }),
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: () => ({
          returning: async () => {
            written.push(values)
            return updateResults.shift() ?? []
          },
        }),
      }),
    }),
  }),
}))
vi.mock('./collections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./collections')>()),
  getOwnedItem: async () => reads.shift(),
}))
const ownedRooms: number[] = []
vi.mock('./limits', () => ({
  assertListRoom: async () => {},
  assertOwnedRoom: async (_owner: string, adding: number) => {
    ownedRooms.push(adding)
    if (refuseOwned) throw new Error('Plan limit reached')
  },
}))
let refuseOwned = false

const { changeItemLists } = await import('./lists')

const limits = {} as PlanLimits
const row = (state: { owned: boolean; wishlisted: boolean }) => ({
  id: '30000000-0000-4000-8000-000000000001',
  ownerId: '00000000-0000-4000-8000-000000000001',
  igdbId: null,
  name: 'GTA V',
  coverId: null,
  data: {},
  ownedOn: [],
  wantedOn: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...state,
})
const ownedRow = row({ owned: true, wishlisted: false })
const wishlistedRow = row({ owned: false, wishlisted: true })

beforeEach(() => {
  reads.length = 0
  deleteResults.length = 0
  updateResults.length = 0
  written.length = 0
  deletes = 0
  ownedRooms.length = 0
  refuseOwned = false
})

describe('changeItemLists', () => {
  it('deletes a game taken off its only list', async () => {
    reads.push(ownedRow)
    deleteResults.push([{ id: ownedRow.id }])
    expect(
      await changeItemLists('o', ownedRow.id, [{ type: 'unown' }], limits),
    ).toBeNull()
    expect(deletes).toBe(1)
  })

  it('does not delete a game that moved to the Wishlist in another tab', async () => {
    // This tab saw it owned and unowns it. The delete matches nothing,
    // since the game is wishlisted now, so it reads again.
    reads.push(ownedRow, wishlistedRow)
    deleteResults.push([])
    updateResults.push([wishlistedRow])
    const saved = await changeItemLists(
      'o',
      ownedRow.id,
      [{ type: 'unown' }],
      limits,
    )
    expect(deletes).toBe(1)
    expect(saved).toMatchObject({ owned: false, wishlisted: true })
    expect(written).toEqual([
      { owned: false, wishlisted: true, ownedOn: [], wantedOn: [] },
    ])
  })

  it('answers 409 when the game keeps changing under it', async () => {
    reads.push(ownedRow, ownedRow)
    await expect(
      changeItemLists('o', ownedRow.id, [{ type: 'toWishlist' }], limits),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(written).toHaveLength(2)
  })

  it('checks owned room when Got it makes a wishlisted game owned', async () => {
    reads.push(wishlistedRow)
    updateResults.push([ownedRow])
    await changeItemLists('o', wishlistedRow.id, [{ type: 'gotIt' }], limits)
    expect(ownedRooms).toEqual([1])
  })

  it('refuses Got it at the owned limit and saves nothing', async () => {
    refuseOwned = true
    reads.push(wishlistedRow)
    await expect(
      changeItemLists('o', wishlistedRow.id, [{ type: 'gotIt' }], limits),
    ).rejects.toThrow('Plan limit reached')
    expect(written).toHaveLength(0)
  })

  it('needs no owned room for a game that is already owned, or for the Wishlist', async () => {
    refuseOwned = true
    reads.push(ownedRow, ownedRow)
    updateResults.push([ownedRow], [ownedRow])
    await changeItemLists('o', ownedRow.id, [{ type: 'own' }], limits)
    await changeItemLists('o', ownedRow.id, [{ type: 'want' }], limits)
    expect(ownedRooms).toEqual([])
  })
})
