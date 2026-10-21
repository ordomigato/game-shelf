import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import type { FieldDefinition } from '../../shared/types/collection'
import { collectionCsv } from '../../shared/utils/csv'
import { autoMap, planImport } from '../../shared/utils/csv-import'
import { planPlatforms, type PlatformName } from './import-platforms'

const catalog: PlatformName[] = [
  {
    igdbId: 19,
    name: 'Super Nintendo Entertainment System',
    abbreviation: 'SNES',
  },
  { igdbId: 130, name: 'Nintendo Switch', abbreviation: 'Switch' },
  { igdbId: 6, name: 'PC (Microsoft Windows)', abbreviation: null },
]
const zelda = { igdbId: 1022, platformIds: [19, 130, 6] }
const rowOf = (extra: object) => ({
  name: 'Zelda',
  igdbId: 1022 as number | null,
  values: {},
  row: 2,
  ...extra,
})
const plan = (
  rows: ReturnType<typeof rowOf>[],
  held: Parameters<typeof planPlatforms>[3] = () => undefined,
) =>
  planPlatforms(
    rows,
    (row) => (row.igdbId === 1022 ? zelda : undefined),
    catalog,
    held,
  )

describe('planPlatforms', () => {
  it('matches names and short names in any case', () => {
    const result = plan([
      rowOf({
        platforms: ['snes', 'pc (microsoft windows)'],
        wishlistPlatforms: ['NINTENDO SWITCH'],
      }),
    ])
    expect(result.problems).toEqual([])
    expect([...result.owned.get(1022)!]).toEqual([19, 6])
    expect([...result.wanted.get(1022)!]).toEqual([130])
  })

  it('reports names that do not match, and games added by hand', () => {
    const result = plan([
      rowOf({ platforms: ['SNES', 'Atari'] }),
      rowOf({ igdbId: null, row: 3, wishlistPlatforms: ['SNES'] }),
    ])
    expect(result.problems).toEqual([
      { row: 2, list: 'owned', value: 'Atari', reason: 'unknownPlatform' },
      { row: 3, list: 'wanted', value: 'SNES', reason: 'handAddedPlatforms' },
    ])
  })

  it('never moves a platform between the lists', () => {
    const result = plan(
      [rowOf({ platforms: ['SNES'], wishlistPlatforms: ['SNES', 'Switch'] })],
      () => ({ owned: true, ownedOn: [6], wantedOn: [] }),
    )
    expect(result.problems).toEqual([
      { row: 2, list: 'wanted', value: 'SNES', reason: 'ownedPlatforms' },
    ])
    expect([...result.wanted.get(1022)!]).toEqual([130])
    const again = plan(
      [rowOf({ wishlistPlatforms: ['PC (Microsoft Windows)'] })],
      () => ({ owned: true, ownedOn: [6], wantedOn: [] }),
    )
    expect(again.problems[0]?.reason).toBe('ownedPlatforms')
    const wanted = plan([rowOf({ platforms: ['Switch'] })], () => ({
      owned: true,
      ownedOn: [],
      wantedOn: [130],
    }))
    expect(wanted.problems[0]?.reason).toBe('wantedPlatforms')
  })

  it('leaves the platforms of a game only on the Wishlist alone', () => {
    const result = plan([rowOf({ platforms: ['SNES'] })], () => ({
      owned: false,
      ownedOn: [],
      wantedOn: [19],
    }))
    expect(result.problems[0]?.reason).toBe('notOwnedPlatforms')
    expect(result.owned.size).toBe(0)
  })
})

describe('an export imports back', () => {
  it('keeps owned and wishlist platforms, with nothing lost', () => {
    const fields: FieldDefinition[] = [
      { id: 'g', name: 'Genre', type: 'text' },
      { id: 'p', name: 'Platforms', type: 'text' },
      { id: 'l', name: 'List', type: 'text' },
    ]
    const csv = collectionCsv(
      fields,
      [
        {
          name: 'Zelda',
          igdbId: 1022,
          addedAt: '2026-01-01T00:00:00Z',
          data: { g: 'Mine', p: 'Shelf 2', l: 'Backlog' },
          owned: true,
          wishlisted: true,
          releaseDate: '1991-11-21',
          releasePrecision: 'day',
          genres: ['Adventure'],
          ownedOn: [19],
          wantedOn: [130, 6],
          catalogPlatforms: [
            { id: 6, name: 'PC (Microsoft Windows)' },
            { id: 19, name: 'SNES' },
            { id: 130, name: 'Switch' },
          ],
        },
      ],
      [
        'Name',
        'IGDB ID',
        'Added',
        'Released',
        'Genre',
        'Platforms',
        'Wishlist platforms',
        'List',
      ],
    )
    const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ''), {
      skipEmptyLines: 'greedy',
    }).data
    const [headers = [], ...body] = parsed
    const targets = autoMap(headers, body, fields)
    const imported = planImport(headers, body, targets, fields)
    expect(imported.problems).toEqual([])
    // Core columns come first, so the user's own fields keep their values.
    expect(imported.rows[0]!.values).toEqual({
      g: 'Mine',
      p: 'Shelf 2',
      l: 'Backlog',
    })
    // The core List column says where the game goes.
    expect(imported.rows[0]!.list).toBe('both')
    const result = planPlatforms(
      imported.rows,
      () => zelda,
      catalog,
      () => undefined,
    )
    expect(result.problems).toEqual([])
    expect([...result.owned.get(1022)!]).toEqual([19])
    expect([...result.wanted.get(1022)!].sort((a, b) => a - b)).toEqual([
      6, 130,
    ])
  })
})
