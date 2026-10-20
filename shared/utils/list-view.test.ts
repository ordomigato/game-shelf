import { describe, expect, it } from 'vitest'
import {
  COLLECTIONS_FILTER,
  columnOfSortKey,
  GENRES_FILTER,
  pruneView,
  PLATFORMS_FILTER,
  sortKeyOf,
  viewFromQuery,
  viewToQuery,
} from './list-view'

describe('viewFromQuery', () => {
  it('uses the viewer’s page size when the address names none', () => {
    expect(viewFromQuery({}, 25)).toEqual({
      page: 1,
      size: 25,
      sort: null,
      dir: 'asc',
      q: '',
      filters: {},
    })
  })

  it('reads every part, with filters as repeated or single values', () => {
    expect(
      viewFromQuery(
        {
          page: '3',
          size: '100',
          sort: 'f.price',
          dir: 'desc',
          q: 'zelda',
          collection: ['a', 'b'],
          platform: '19',
          genre: ['Adventure', 'Puzzle'],
          'f.status': ['Done', 'Playing'],
          'f.done': 'yes',
        },
        50,
      ),
    ).toEqual({
      page: 3,
      size: 100,
      sort: 'f.price',
      dir: 'desc',
      q: 'zelda',
      filters: {
        [COLLECTIONS_FILTER]: ['a', 'b'],
        [PLATFORMS_FILTER]: ['19'],
        [GENRES_FILTER]: ['Adventure', 'Puzzle'],
        status: ['Done', 'Playing'],
        done: ['yes'],
      },
    })
  })

  it('falls back to the defaults for nonsense', () => {
    expect(
      viewFromQuery({ page: '-2', size: '7', dir: 'up', q: ['a', 'b'] }, 50),
    ).toMatchObject({ page: 1, size: 50, dir: 'asc', q: 'a' })
  })
})

describe('viewToQuery', () => {
  it('leaves out defaults and round-trips the rest', () => {
    expect(viewToQuery(viewFromQuery({}, 50), { withSize: false })).toEqual({})
    const query = {
      page: '2',
      size: '25',
      sort: 'name',
      dir: 'desc',
      q: 'mario',
      collection: ['a'],
      genre: ['RPG'],
      'f.status': ['Done'],
    }
    expect(viewToQuery(viewFromQuery(query, 50), { withSize: true })).toEqual(
      query,
    )
  })

  it('keeps the size only when asked', () => {
    const view = viewFromQuery({ size: '25' }, 50)
    expect(viewToQuery(view, { withSize: false })).toEqual({})
    expect(viewToQuery(view, { withSize: true })).toEqual({ size: '25' })
  })
})

describe('sort keys', () => {
  it('turns field columns into f.<id> and back', () => {
    expect(sortKeyOf('name')).toBe('name')
    expect(sortKeyOf('inCollections')).toBe('inCollections')
    expect(sortKeyOf('abc123')).toBe('f.abc123')
    expect(columnOfSortKey('f.abc123')).toBe('abc123')
    expect(columnOfSortKey('addedAt')).toBe('addedAt')
  })
})

describe('pruneView', () => {
  it('drops a sort and filters on fields that are gone, keeping the rest', () => {
    const view = viewFromQuery(
      {
        sort: 'f.gone',
        'f.gone': 'x',
        'f.kept': 'y',
        collection: 'c',
        platform: '1',
        genre: 'Puzzle',
        q: 'a',
      },
      50,
    )
    expect(pruneView(view, new Set(['kept']))).toMatchObject({
      sort: null,
      q: 'a',
      filters: {
        kept: ['y'],
        [COLLECTIONS_FILTER]: ['c'],
        [PLATFORMS_FILTER]: ['1'],
        [GENRES_FILTER]: ['Puzzle'],
      },
    })
    expect(
      pruneView(viewFromQuery({ sort: 'f.kept' }, 50), new Set(['kept'])).sort,
    ).toBe('f.kept')
    expect(pruneView(viewFromQuery({ sort: 'name' }, 50), new Set()).sort).toBe(
      'name',
    )
  })
})
