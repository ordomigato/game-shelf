import { describe, expect, it } from 'vitest'
import { dedupeEntries, planBulkAdd } from './bulk-add'
import { listStateValid, newListState, type ListState } from './lists'

const SWITCH = 130
const PS5 = 167
const catalog = new Map([
  [1, { platformIds: [SWITCH, PS5] }],
  [2, { platformIds: [SWITCH] }],
  [3, { platformIds: [PS5] }],
])
const state = (overrides: Partial<ListState>): ListState => ({
  owned: false,
  wishlisted: false,
  ownedOn: [],
  wantedOn: [],
  ...overrides,
})

describe('planBulkAdd to Owned', () => {
  it('creates owned games on the scanned platform', () => {
    const plan = planBulkAdd(
      'owned',
      [
        { igdbId: 1, platformId: SWITCH },
        { igdbId: 2, platformId: SWITCH },
      ],
      new Map(),
      catalog,
    )
    expect(plan.added).toBe(2)
    expect(plan.writes).toEqual([
      { igdbId: 1, state: newListState('owned', [SWITCH]), isNew: true },
      { igdbId: 2, state: newListState('owned', [SWITCH]), isNew: true },
    ])
  })

  it('adds the platform to a game owned on another one', () => {
    const existing = new Map([[1, state({ owned: true, ownedOn: [SWITCH] })]])
    const plan = planBulkAdd(
      'owned',
      [{ igdbId: 1, platformId: PS5 }],
      existing,
      catalog,
    )
    expect(plan.writes[0]).toMatchObject({
      isNew: false,
      state: { owned: true, ownedOn: [SWITCH, PS5].sort((a, b) => a - b) },
    })
  })

  it('moves a game wanted on that platform over to owned, like Got it', () => {
    const existing = new Map([
      [1, state({ wishlisted: true, wantedOn: [SWITCH] })],
    ])
    const plan = planBulkAdd(
      'owned',
      [{ igdbId: 1, platformId: SWITCH }],
      existing,
      catalog,
    )
    expect(plan.writes[0]!.state).toEqual({
      owned: true,
      wishlisted: false,
      ownedOn: [SWITCH],
      wantedOn: [],
    })
    expect(plan.added).toBe(1)
  })

  it('keeps a wish for another platform when owning one', () => {
    const existing = new Map([
      [1, state({ wishlisted: true, wantedOn: [PS5] })],
    ])
    const plan = planBulkAdd(
      'owned',
      [{ igdbId: 1, platformId: SWITCH }],
      existing,
      catalog,
    )
    expect(plan.writes[0]!.state).toEqual({
      owned: true,
      wishlisted: true,
      ownedOn: [SWITCH],
      wantedOn: [PS5],
    })
  })

  it('skips a game already owned on that platform but keeps it for a collection', () => {
    const existing = new Map([[1, state({ owned: true, ownedOn: [SWITCH] })]])
    const plan = planBulkAdd(
      'owned',
      [{ igdbId: 1, platformId: SWITCH }],
      existing,
      catalog,
    )
    expect(plan.writes).toEqual([])
    expect(plan.added).toBe(0)
    expect(plan.skipped).toEqual([{ igdbId: 1, reason: 'already' }])
    expect(plan.present).toEqual([1])
  })

  it('adds a box with no platform as an owned game', () => {
    const plan = planBulkAdd(
      'owned',
      [{ igdbId: 1, platformId: null }],
      new Map([[1, state({ wishlisted: true })]]),
      catalog,
    )
    expect(plan.writes[0]!.state).toMatchObject({
      owned: true,
      wishlisted: false,
    })
  })
})

describe('planBulkAdd to the Wishlist', () => {
  it('creates wishlisted games wanted on the platform', () => {
    const plan = planBulkAdd(
      'wishlist',
      [{ igdbId: 3, platformId: PS5 }],
      new Map(),
      catalog,
    )
    expect(plan.writes[0]!.state).toEqual(newListState('wishlist', [PS5]))
  })

  it('leaves a game owned on that platform alone', () => {
    const existing = new Map([[1, state({ owned: true, ownedOn: [SWITCH] })]])
    const plan = planBulkAdd(
      'wishlist',
      [{ igdbId: 1, platformId: SWITCH }],
      existing,
      catalog,
    )
    expect(plan.writes).toEqual([])
    expect(plan.skipped).toEqual([{ igdbId: 1, reason: 'ownedHere' }])
  })

  it('wishes for another version of a game that is owned', () => {
    const existing = new Map([[1, state({ owned: true, ownedOn: [SWITCH] })]])
    const plan = planBulkAdd(
      'wishlist',
      [{ igdbId: 1, platformId: PS5 }],
      existing,
      catalog,
    )
    expect(plan.writes[0]!.state).toEqual({
      owned: true,
      wishlisted: true,
      ownedOn: [SWITCH],
      wantedOn: [PS5],
    })
  })

  it('skips a game already wanted on that platform', () => {
    const existing = new Map([
      [1, state({ wishlisted: true, wantedOn: [SWITCH] })],
    ])
    const plan = planBulkAdd(
      'wishlist',
      [{ igdbId: 1, platformId: SWITCH }],
      existing,
      catalog,
    )
    expect(plan.skipped).toEqual([{ igdbId: 1, reason: 'already' }])
  })

  it('does not take an owned game with no platform off Owned', () => {
    const plan = planBulkAdd(
      'wishlist',
      [{ igdbId: 1, platformId: null }],
      new Map([[1, state({ owned: true })]]),
      catalog,
    )
    expect(plan.writes).toEqual([])
    expect(plan.skipped).toEqual([{ igdbId: 1, reason: 'ownedHere' }])
  })
})

describe('planBulkAdd in general', () => {
  it('skips games IGDB does not know and platforms the game is not on', () => {
    const plan = planBulkAdd(
      'owned',
      [
        { igdbId: 99, platformId: SWITCH },
        { igdbId: 2, platformId: PS5 },
      ],
      new Map(),
      catalog,
    )
    expect(plan.writes).toEqual([])
    expect(plan.present).toEqual([])
    expect(plan.skipped).toEqual([
      { igdbId: 99, reason: 'notFound' },
      { igdbId: 2, reason: 'platform' },
    ])
  })

  it('counts a game once when two boxes are for different platforms', () => {
    const plan = planBulkAdd(
      'owned',
      [
        { igdbId: 1, platformId: SWITCH },
        { igdbId: 1, platformId: PS5 },
        { igdbId: 1, platformId: SWITCH },
      ],
      new Map(),
      catalog,
    )
    expect(plan.added).toBe(1)
    expect(plan.writes).toHaveLength(1)
    expect(plan.writes[0]!.state.ownedOn).toEqual([SWITCH, PS5])
  })

  it('only ever produces states the database accepts', () => {
    const starts: (ListState | undefined)[] = [
      undefined,
      state({ owned: true }),
      state({ owned: true, ownedOn: [SWITCH] }),
      state({ wishlisted: true }),
      state({ wishlisted: true, wantedOn: [SWITCH] }),
      state({
        owned: true,
        wishlisted: true,
        ownedOn: [PS5],
        wantedOn: [SWITCH],
      }),
    ]
    for (const start of starts) {
      for (const list of ['owned', 'wishlist'] as const) {
        for (const platformId of [null, SWITCH, PS5]) {
          const plan = planBulkAdd(
            list,
            [{ igdbId: 1, platformId }],
            new Map(start ? [[1, start]] : []),
            catalog,
          )
          for (const write of plan.writes) {
            expect(listStateValid(write.state)).toBe(true)
          }
        }
      }
    }
  })
})

describe('dedupeEntries', () => {
  it('keeps each game and platform once', () => {
    expect(
      dedupeEntries([
        { igdbId: 1, platformId: 2 },
        { igdbId: 1, platformId: 2 },
        { igdbId: 1, platformId: null },
        { igdbId: 1, platformId: null },
      ]),
    ).toEqual([
      { igdbId: 1, platformId: 2 },
      { igdbId: 1, platformId: null },
    ])
  })
})
