import { describe, expect, it } from 'vitest'
import type { BarcodeMatch } from '../../shared/types/barcode'
import {
  canTick,
  defaultTicked,
  entriesToAdd,
  parseStoredRows,
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
