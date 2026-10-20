import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import type { FieldDefinition } from '../../shared/types/collection'
import {
  escapeLike,
  isFiltered,
  listOrder,
  listWhere,
  parseListQuery,
} from './list-query'

vi.mock('./db', () => ({ useDb: () => ({}) }))

const dialect = new PgDialect()
const render = (query: SQL) => dialect.sqlToQuery(query)
const renderAll = (queries: SQL[]) => queries.map((q) => render(q))

const owner = '00000000-0000-4000-8000-000000000001'
const collection = '10000000-0000-4000-8000-000000000003'

const fields: FieldDefinition[] = [
  { id: 'price', name: 'Price', type: 'currency', currency: 'USD' },
  { id: 'score', name: 'Score', type: 'rating', scale: 10 },
  { id: 'done', name: 'Finished', type: 'checkbox' },
  { id: 'bought', name: 'Bought', type: 'date' },
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: ['Playing', 'Done'],
  },
  { id: 'tags', name: 'Tags', type: 'multiselect', options: ['Co-op', 'RPG'] },
  { id: 'note', name: 'Note', type: 'text', hidden: true },
]

const parse = (raw: Record<string, unknown> = {}) => parseListQuery(raw, fields)

describe('parseListQuery', () => {
  it('defaults to the first page of 50, newest first', () => {
    expect(parse()).toEqual({
      page: 1,
      size: 50,
      sort: null,
      dir: 'asc',
      q: '',
      searchFields: [fields[4], fields[5], fields[6]],
      collectionIds: [],
      platformIds: [],
      genres: [],
      fieldFilters: [],
    })
  })

  it('reads every part', () => {
    const query = parse({
      page: '3',
      size: '25',
      sort: 'f.price',
      dir: 'desc',
      q: '  zelda ',
      collection: [collection],
      platform: ['19', '12'],
      genre: ['Adventure', 'Role-playing (RPG)'],
      'f.status': ['Done'],
      'f.done': 'yes',
    })
    expect(query.page).toBe(3)
    expect(query.size).toBe(25)
    expect(query.sort).toEqual({ field: fields[0] })
    expect(query.dir).toBe('desc')
    expect(query.q).toBe('zelda')
    expect(query.collectionIds).toEqual([collection])
    expect(query.platformIds).toEqual([19, 12])
    expect(query.genres).toEqual(['Adventure', 'Role-playing (RPG)'])
    expect(query.fieldFilters.map((f) => [f.field.id, f.values])).toEqual([
      ['status', ['Done']],
      ['done', ['yes']],
    ])
  })

  it('accepts the built-in columns', () => {
    for (const column of [
      'name',
      'inCollections',
      'year',
      'genre',
      'platforms',
      'addedAt',
    ]) {
      expect(parse({ sort: column }).sort).toEqual({ column })
    }
  })

  it.each([
    ['a page size outside the allow list', { size: '1000' }],
    ['page zero', { page: '0' }],
    ['a page that is not a number', { page: 'x' }],
    ['a direction that is not asc or desc', { dir: 'sideways' }],
    ['a sort that is neither a column nor a field', { sort: 'password' }],
    ['a sort that tries to inject SQL', { sort: 'name; drop table users' }],
    ['a checkbox filter that is not yes or no', { 'f.done': 'maybe' }],
    ['a collection that is not an id', { collection: 'x' }],
    ['a platform that is not a number', { platform: '1; drop table x' }],
    ['a genre that is empty', { genre: '' }],
    ['a genre that is too long', { genre: 'x'.repeat(101) }],
    [
      'too many genres',
      { genre: Array.from({ length: 51 }, (_, i) => `g${i}`) },
    ],
    ['a search that is too long', { q: 'x'.repeat(101) }],
    ['a page given twice', { page: ['1', '2'] }],
  ])('rejects %s', (_name, raw) => {
    expect(() => parse(raw)).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    )
  })
})

describe('stale links', () => {
  it('ignores a sort or filter on a field that is gone or cannot be filtered', () => {
    const query = parse({
      sort: 'f.deleted',
      'f.deleted': 'x',
      'f.price': 'x',
      'f.done': 'yes',
    })
    expect(query.sort).toBeNull()
    expect(query.fieldFilters.map((f) => f.field.id)).toEqual(['done'])
  })

  it('still rejects a malformed value for a field that exists', () => {
    expect(() => parse({ 'f.done': 'maybe' })).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    )
  })
})

describe('isFiltered', () => {
  it('is false for a plain page and true once something narrows it', () => {
    expect(isFiltered(parse({ page: '2', sort: 'name' }))).toBe(false)
    expect(isFiltered(parse({ q: 'a' }))).toBe(true)
    expect(isFiltered(parse({ 'f.done': 'yes' }))).toBe(true)
    expect(isFiltered(parse({ platform: '1' }))).toBe(true)
    expect(isFiltered(parse({ genre: 'RPG' }))).toBe(true)
    expect(isFiltered(parse({ collection: collection }))).toBe(true)
  })
})

describe('listWhere', () => {
  const where = (
    raw: Record<string, unknown> = {},
    list: 'owned' | 'wishlist' = 'owned',
  ) => render(listWhere(owner, list, parse(raw)))

  it('is always scoped to the owner and the list', () => {
    const owned = where()
    expect(owned.sql).toContain('"library_items"."owner_id" = $1')
    expect(owned.sql).toContain('"library_items"."owned" = $2')
    expect(owned.params.slice(0, 2)).toEqual([owner, true])
    const wishlist = where({}, 'wishlist')
    expect(wishlist.sql).toContain('"library_items"."wishlisted" = $2')
  })

  it('keeps the owner in every filter and passes input as values', () => {
    const { sql, params } = where({
      q: "o'brien",
      collection: collection,
      platform: '19',
      'f.status': "x'; drop table users; --",
    })
    expect(sql).not.toContain('drop table')
    expect(sql).not.toContain("o'brien")
    expect(params).toContain("x'; drop table users; --")
    // The collections must be the owner's too.
    expect(sql).toContain('owned_collection.owner_id =')
    expect(params.filter((p) => p === owner).length).toBeGreaterThanOrEqual(2)
  })

  it('searches the game name, case-insensitively, as plain text', () => {
    const { sql, params } = where({ q: '50%_off\\' })
    expect(sql).toContain('ilike')
    expect(sql).toContain('coalesce("games"."name", "library_items"."name")')
    expect(params).toContain('%50\\%\\_off\\\\%')
  })

  it('also searches text and choice values, collection titles and platform names', () => {
    const { sql, params } = where({ q: "Zelda'; drop table x" })
    expect(sql).not.toContain('Zelda')
    expect(sql).toContain('searched_collection.title')
    expect(sql).toContain('searched_collection.owner_id =')
    expect(sql).toContain(
      'coalesce(searched_platform.abbreviation, searched_platform.name)',
    )
    expect(sql).toContain(
      'searched_platform.igdb_id = any(library_items.owned_on || library_items.wanted_on)',
    )
    expect(sql).toContain('searched_choice.name')
    // Text and select (Status, Note) and multiselect (Tags), not the others.
    expect(params).toContain('status')
    expect(params).toContain('note')
    expect(params).toContain('tags')
    expect(params).not.toContain('price')
    expect(params).toContain("%Zelda';%")
    expect(params).toContain('%drop%')
  })

  it('needs every word, each found in any of those places', () => {
    const { sql } = where({ q: 'mario  snes' })
    expect(sql.match(/searched_collection\.title/g)).toHaveLength(2)
    expect(where({ q: 'x' }, 'wishlist').sql).toContain(
      'any(library_items.owned_on || library_items.wanted_on)',
    )
  })

  it('filters platforms on owned and wanted together, on either list', () => {
    expect(where({ platform: ['1', '2'] }).sql).toContain(
      '(library_items.owned_on || library_items.wanted_on) && ARRAY[$3, $4]::integer[]',
    )
    expect(where({ platform: '1' }, 'wishlist').sql).toContain(
      '(library_items.owned_on || library_items.wanted_on) &&',
    )
  })

  it('filters genres by any overlap, guarded for games with no catalog row', () => {
    const { sql, params } = where({ genre: ["Puzzle'; drop table x", 'RPG'] })
    expect(sql).toContain(
      '(case when "games"."igdb_id" is not null then "games"."genres" && ARRAY[$3, $4]::text[] else false end)',
    )
    expect(sql).not.toContain('Puzzle')
    expect(params.slice(2)).toEqual(["Puzzle'; drop table x", 'RPG'])
    expect(sql).toContain('"library_items"."owner_id" = $1')
  })

  it('filters a checkbox to ticked, or to everything not ticked', () => {
    expect(where({ 'f.done': 'yes' }).sql).toContain(
      "coalesce(((library_items.data -> $3::text) = 'true'::jsonb), false)",
    )
    expect(where({ 'f.done': 'no' }).sql).toContain(
      "not coalesce(((library_items.data -> $3::text) = 'true'::jsonb), false)",
    )
    // Both ticked and not ticked is every game: no condition added.
    const both = where({ 'f.done': ['yes', 'no'] })
    expect(both.sql).not.toContain('true')
  })

  it('matches a choice by any wanted option, and lists by any overlap', () => {
    const select = where({ 'f.status': ['Playing', 'Done'] })
    expect(select.sql).toContain(
      "jsonb_typeof((library_items.data -> $3::text)) = 'string'",
    )
    expect(select.sql).toContain('= any(ARRAY[$5, $6]::text[])')
    expect(select.params.slice(2)).toEqual([
      'status',
      'status',
      'Playing',
      'Done',
    ])
    const multi = where({ 'f.tags': 'RPG' })
    expect(multi.sql).toContain('jsonb_array_elements_text')
    expect(multi.params).toContain('RPG')
  })

  it('takes the field id as a value, never as SQL text', () => {
    const { sql, params } = where({ 'f.status': 'Done' })
    expect(sql).not.toContain('status')
    expect(params).toContain('status')
  })
})

describe('listOrder', () => {
  const order = (
    raw: Record<string, unknown>,
    list: 'owned' | 'wishlist' = 'owned',
  ) => renderAll(listOrder(owner, list, parse(raw))).map((q) => q.sql)

  it('is newest first with an id tiebreak when nothing is chosen', () => {
    expect(order({})).toEqual([
      'library_items.created_at desc',
      'library_items.id desc',
    ])
  })

  it('puts empty values last in both directions, then breaks ties', () => {
    for (const dir of ['asc', 'desc']) {
      const parts = order({ sort: 'f.score', dir })
      expect(parts).toHaveLength(3)
      expect(parts[0]).toMatch(new RegExp(`${dir} nulls last$`))
      expect(parts.slice(1)).toEqual([
        'library_items.created_at desc',
        'library_items.id desc',
      ])
    }
  })

  it('sorts the name without regard to case', () => {
    expect(order({ sort: 'name' })[0]).toContain(
      'lower(coalesce("games"."name", "library_items"."name")) collate "natural_sort" asc nulls last',
    )
  })

  it('sorts platforms by the first owned platform, then the first wanted one', () => {
    const expected =
      'coalesce((library_items.owned_on)[1], (library_items.wanted_on)[1])'
    expect(order({ sort: 'platforms' })[0]).toContain(expected)
    expect(order({ sort: 'platforms' }, 'wishlist')[0]).toContain(expected)
  })

  it('sorts the year by the release date, empty last, without word order', () => {
    expect(order({ sort: 'year' })[0]).toBe(
      '"games"."release_date" asc nulls last',
    )
    expect(order({ sort: 'year', dir: 'desc' })[0]).toBe(
      '"games"."release_date" desc nulls last',
    )
  })

  it('sorts the genre by the first genre, in natural order', () => {
    expect(order({ sort: 'genre' })[0]).toBe(
      'lower(("games"."genres")[1]) collate "natural_sort" asc nulls last',
    )
  })

  it('sorts collections by name, only the owners own', () => {
    const names = renderAll(
      listOrder(owner, 'owned', parse({ sort: 'inCollections' })),
    )[0]!
    expect(names.sql).toContain('string_agg(lower(')
    expect(names.params).toContain(owner)
  })

  it('sorts each kind of field by its type', () => {
    const first = (id: string) => order({ sort: `f.${id}` })[0]!
    expect(first('price')).toContain('::numeric end')
    expect(first('score')).toContain(
      "jsonb_typeof((library_items.data -> $1::text)) = 'number'",
    )
    expect(first('done')).toContain('not ')
    expect(first('done')).toContain('::boolean')
    expect(first('bought')).toContain("= 'string' then")
    expect(first('bought')).not.toContain('lower(')
    expect(first('status')).toContain('lower(')
    expect(first('note')).toContain('lower(')
    expect(first('tags')).toContain('string_agg')
    expect(first('tags')).toContain('with ordinality')
  })

  it('orders words with numbers by value, only where it compares words', () => {
    for (const sort of [
      'name',
      'platforms',
      'genre',
      'inCollections',
      'f.status',
      'f.note',
      'f.tags',
    ]) {
      expect(order({ sort })[0]).toContain(' collate "natural_sort" asc')
    }
    for (const sort of ['addedAt', 'year', 'f.price', 'f.bought', 'f.done']) {
      expect(order({ sort })[0]).not.toContain('collate')
    }
  })

  it('passes the field id as a value', () => {
    const [sort] = renderAll(
      listOrder(owner, 'owned', parse({ sort: 'f.score' })),
    )
    expect(sort!.params).toEqual(['score', 'score'])
    expect(sort!.sql).not.toContain('score')
  })
})

describe('escapeLike', () => {
  it('escapes the characters LIKE treats as patterns', () => {
    expect(escapeLike('100%_\\')).toBe('100\\%\\_\\\\')
    expect(escapeLike('plain')).toBe('plain')
  })
})
