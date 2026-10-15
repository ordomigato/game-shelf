import { describe, expect, it } from 'vitest'
import type { CatalogRow } from './catalog'
import { toLibraryItem } from './collections'

const item = {
  id: '30000000-0000-4000-8000-000000000001',
  ownerId: '00000000-0000-4000-8000-000000000001',
  igdbId: 1026,
  name: 'Zelda 3',
  coverId: 'old',
  data: { hours: 12 },
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

const game: CatalogRow = {
  igdbId: 1026,
  name: 'The Legend of Zelda: A Link to the Past',
  coverId: 'co3vzn',
  releaseDate: '1991-11-21',
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
      year: 1991,
      genres: ['Adventure', 'Role-playing (RPG)'],
      data: { hours: 12 },
    })
  })

  it('uses the catalog’s missing cover and date as they are', () => {
    const bare = { ...game, coverId: null, releaseDate: null, genres: [] }
    expect(toLibraryItem(item, bare)).toMatchObject({
      coverId: null,
      year: null,
      genres: [],
    })
  })

  it('falls back to the item’s own name and cover without a catalog row', () => {
    expect(toLibraryItem(item, null)).toMatchObject({
      name: 'Zelda 3',
      coverId: 'old',
      year: null,
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
