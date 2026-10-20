import { describe, expect, it } from 'vitest'
import type { CatalogRow } from './catalog'
import {
  catalogPlatformsOf,
  toCollectionEntry,
  toLibraryItem,
} from './collections'

const item = {
  id: '30000000-0000-4000-8000-000000000001',
  ownerId: '00000000-0000-4000-8000-000000000001',
  igdbId: 1026,
  name: 'Zelda 3',
  coverId: 'old',
  data: { hours: 12 },
  owned: true,
  wishlisted: false,
  ownedOn: [],
  wantedOn: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

const game: CatalogRow = {
  igdbId: 1026,
  name: 'The Legend of Zelda: A Link to the Past',
  coverId: 'co3vzn',
  releaseDate: '1991-11-21',
  releasePrecision: 'day',
  genres: ['Adventure', 'Role-playing (RPG)'],
  platformIds: [19],
  fetchedAt: new Date(0),
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

describe('toLibraryItem', () => {
  it('takes an IGDB game’s facts from the catalog', () => {
    expect(toLibraryItem(item, game)).toEqual({
      id: item.id,
      igdbId: 1026,
      name: 'The Legend of Zelda: A Link to the Past',
      coverId: 'co3vzn',
      releaseDate: '1991-11-21',
      releasePrecision: 'day',
      genres: ['Adventure', 'Role-playing (RPG)'],
      data: { hours: 12 },
      owned: true,
      wishlisted: false,
      ownedOn: [],
      wantedOn: [],
    })
  })

  it('carries the lists and the platforms for each', () => {
    const both = {
      ...item,
      owned: true,
      wishlisted: true,
      ownedOn: [12],
      wantedOn: [48],
    }
    expect(toLibraryItem(both, game)).toMatchObject({
      owned: true,
      wishlisted: true,
      ownedOn: [12],
      wantedOn: [48],
    })
  })

  it('uses the catalog’s missing cover and date as they are', () => {
    const bare = {
      ...game,
      coverId: null,
      releaseDate: null,
      releasePrecision: null,
      genres: [],
    }
    expect(toLibraryItem(item, bare)).toMatchObject({
      coverId: null,
      releaseDate: null,
      releasePrecision: null,
      genres: [],
    })
  })

  it('falls back to the item’s own name and cover without a catalog row', () => {
    expect(toLibraryItem(item, null)).toMatchObject({
      name: 'Zelda 3',
      coverId: 'old',
      releaseDate: null,
      releasePrecision: null,
      genres: [],
    })
  })

  it('keeps a game added by hand as it is', () => {
    const byHand = { ...item, igdbId: null, name: 'Homebrew', coverId: null }
    expect(toLibraryItem(byHand, null)).toMatchObject({
      igdbId: null,
      name: 'Homebrew',
      coverId: null,
    })
  })
})

describe('toCollectionEntry', () => {
  const both = {
    ...item,
    owned: true,
    wishlisted: true,
    ownedOn: [12],
    wantedOn: [48],
  }

  it('gives the owner the lists and platforms', () => {
    expect(toCollectionEntry(both, game, new Date(0), true)).toMatchObject({
      wanted: true,
      owned: true,
      wishlisted: true,
      ownedOn: [12],
      wantedOn: [48],
    })
  })

  it('gives a visitor only whether the game is wanted', () => {
    const entry = toCollectionEntry(both, game, new Date(0), false)
    expect(entry.wanted).toBe(true)
    for (const key of [
      'owned',
      'wishlisted',
      'ownedOn',
      'wantedOn',
      'catalogPlatforms',
    ]) {
      expect(entry).not.toHaveProperty(key)
    }
    expect(toCollectionEntry(item, game, new Date(0), false).wanted).toBe(false)
  })

  it('shows a visitor the release date and genres but no platforms', () => {
    const names = new Map([[19, 'SNES']])
    const entry = toCollectionEntry(both, game, new Date(0), false, names)
    expect(entry).toMatchObject({
      releaseDate: '1991-11-21',
      releasePrecision: 'day',
      genres: ['Adventure', 'Role-playing (RPG)'],
    })
    expect(JSON.stringify(entry)).not.toContain('SNES')
  })

  it('gives the owner the catalog platforms to pick from, named', () => {
    const names = new Map([[19, 'SNES']])
    expect(
      toCollectionEntry(both, game, new Date(0), true, names),
    ).toMatchObject({ catalogPlatforms: [{ id: 19, name: 'SNES' }] })
  })
})

describe('catalogPlatformsOf', () => {
  const names = new Map([
    [19, 'SNES'],
    [4, 'N64'],
    [7, 'Wii'],
  ])

  it('names the game’s platforms in name order and skips unknown ones', () => {
    expect(
      catalogPlatformsOf({ ...game, platformIds: [19, 99, 7, 4] }, names),
    ).toEqual([
      { id: 4, name: 'N64' },
      { id: 19, name: 'SNES' },
      { id: 7, name: 'Wii' },
    ])
  })

  it('has none for a game added by hand', () => {
    expect(catalogPlatformsOf(null, names)).toEqual([])
  })
})
