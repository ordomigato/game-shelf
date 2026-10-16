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
vi.mock('./limits', () => ({ assertListRoom: async () => {} }))

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
})
