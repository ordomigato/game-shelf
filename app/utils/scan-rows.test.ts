import { describe, expect, it } from 'vitest'
import type { BarcodeMatch } from '../../shared/types/barcode'
import {
  canTick,
  defaultTicked,
  entriesToAdd,
  parseStoredRows,
  pickGame,
  rowHold,
  type ScanRow,
} from './scan-rows'

const match = (overrides: Partial<BarcodeMatch> = {}): BarcodeMatch => ({
  igdbId: 1,
  name: 'Zelda',
  coverId: null,
  releaseDate: '2017-03-03',
  platform: { id: 130, name: 'Switch' },
  owned: false,
  wishlisted: false,
  ownedOn: [],
  wantedOn: [],
  ...overrides,
})
const row = (m: BarcodeMatch, ticked = true): ScanRow => ({
  code: `c${m.igdbId}`,
  status: 'match',
  match: m,
  ticked,
})

describe('rowHold', () => {
  it('calls a game owned on the platform already owned', () => {
    const owned = match({ owned: true, ownedOn: [130] })
    expect(rowHold(owned, 'owned')).toBe('ownedHere')
    expect(rowHold(owned, 'wishlist')).toBe('ownedHere')
  })

  it('does not call a game owned on another platform owned', () => {
    expect(rowHold(match({ owned: true, ownedOn: [167] }), 'owned')).toBe(
      'ready',
    )
  })

  it('calls a wanted game already on the Wishlist, only for the Wishlist', () => {
    const wanted = match({ wishlisted: true, wantedOn: [130] })
    expect(rowHold(wanted, 'wishlist')).toBe('wishlistedHere')
    expect(rowHold(wanted, 'owned')).toBe('ready')
  })
})

describe('ticking', () => {
  it('starts unticked when the game is already owned there', () => {
    expect(defaultTicked(match({ owned: true, ownedOn: [130] }), 'owned')).toBe(
      false,
    )
    expect(defaultTicked(match(), 'owned')).toBe(true)
  })

  it('lets an owned game be ticked for Owned but never for the Wishlist', () => {
    const owned = row(match({ owned: true, ownedOn: [130] }))
    expect(canTick(owned, 'owned')).toBe(true)
    expect(canTick(owned, 'wishlist')).toBe(false)
  })

  it('never ticks a failed or empty row', () => {
    expect(canTick({ code: 'x', status: 'none', ticked: true }, 'owned')).toBe(
      false,
    )
    expect(canTick({ code: 'x', status: 'error', ticked: true }, 'owned')).toBe(
      false,
    )
  })
})

describe('entriesToAdd', () => {
  it('sends the ticked rows, each game and platform once', () => {
    const entries = entriesToAdd(
      [
        row(match({ igdbId: 1 })),
        { ...row(match({ igdbId: 1 })), code: 'again' },
        row(match({ igdbId: 2 }), false),
        row(match({ igdbId: 3, platform: null })),
        { code: 'none', status: 'none', ticked: false },
      ],
      'owned',
    )
    expect(entries).toEqual([
      { igdbId: 1, platformId: 130 },
      { igdbId: 3, platformId: null },
    ])
  })

  it('leaves out rows that cannot be added to the chosen list', () => {
    expect(
      entriesToAdd([row(match({ owned: true, ownedOn: [130] }))], 'wishlist'),
    ).toEqual([])
  })
})

describe('parseStoredRows', () => {
  it('keeps matches and no-matches and drops anything else', () => {
    const rows = parseStoredRows([
      { code: 'a', status: 'match', match: match(), ticked: true },
      { code: 'b', status: 'none', ticked: true },
      { code: 'c', status: 'loading', ticked: true },
      { code: 'd', status: 'match', match: { nope: true } },
      'junk',
      null,
    ])
    expect(rows.map((r) => r.code)).toEqual(['a', 'b'])
    expect(rows[1]!.ticked).toBe(false)
  })

  it('returns nothing for stored data that is not a list', () => {
    expect(parseStoredRows({})).toEqual([])
    expect(parseStoredRows(undefined)).toEqual([])
  })
})

describe('pickGame', () => {
  const none: ScanRow = { code: 'n', status: 'none', ticked: false }

  it('turns a no-match row into a ticked row of the user’s own', () => {
    const { rows, merged } = pickGame([none], 'n', match(), 'owned')
    expect(merged).toBeNull()
    expect(rows).toEqual([
      { code: 'n', status: 'match', match: match(), ticked: true, own: true },
    ])
  })

  it('picks a game with no platform, and starts unticked if already owned', () => {
    const owned = match({ platform: null, owned: true })
    const { rows } = pickGame([none], 'n', owned, 'owned')
    expect(rows[0]).toMatchObject({ ticked: false, own: true })
    expect(entriesToAdd(rows, 'owned')).toEqual([])
    expect(
      entriesToAdd(
        pickGame([none], 'n', match({ platform: null }), 'owned').rows,
        'owned',
      ),
    ).toEqual([{ igdbId: 1, platformId: null, barcode: 'n', own: true }])
  })

  it('changes a match to another game', () => {
    const scanned = row(match({ igdbId: 1 }))
    const { rows } = pickGame([scanned], 'c1', match({ igdbId: 2 }), 'owned')
    expect(rows[0]).toMatchObject({ code: 'c1', own: true })
    expect(rows[0]!.match?.igdbId).toBe(2)
  })

  it('merges with a row that already holds the same game and platform', () => {
    const existing = row(match({ igdbId: 5 }))
    const { rows, merged } = pickGame(
      [none, existing],
      'n',
      match({ igdbId: 5 }),
      'owned',
    )
    expect(merged).toBe('c5')
    expect(rows).toEqual([existing])
  })

  it('does not merge the same game on another platform', () => {
    const existing = row(match({ igdbId: 5 }))
    const { rows, merged } = pickGame(
      [none, existing],
      'n',
      match({ igdbId: 5, platform: null }),
      'owned',
    )
    expect(merged).toBeNull()
    expect(rows).toHaveLength(2)
  })
})

describe('own picks', () => {
  it('survive a round trip through session storage', () => {
    const { rows } = pickGame(
      [{ code: 'n', status: 'none', ticked: false }],
      'n',
      match(),
      'owned',
    )
    const restored = parseStoredRows(JSON.parse(JSON.stringify(rows)))
    expect(restored).toEqual(rows)
    expect(restored[0]!.own).toBe(true)
  })

  it('send their barcode, and a ScanDex match sends none', () => {
    const picked = pickGame(
      [{ code: 'n', status: 'none', ticked: false }],
      'n',
      match({ igdbId: 2 }),
      'owned',
    ).rows[0]!
    expect(entriesToAdd([picked, row(match({ igdbId: 1 }))], 'owned')).toEqual([
      { igdbId: 2, platformId: 130, barcode: 'n', own: true },
      { igdbId: 1, platformId: 130 },
    ])
  })

  it('add once when two rows hold the same game, keeping the user’s barcode', () => {
    const picked: ScanRow = { ...row(match()), code: 'mine', own: true }
    expect(entriesToAdd([row(match()), picked], 'owned')).toEqual([
      { igdbId: 1, platformId: 130, barcode: 'mine', own: true },
    ])
  })
})
