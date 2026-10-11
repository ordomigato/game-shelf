import { and, eq, inArray, max, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { FieldDefinition, ItemData } from '../../shared/types/collection'
import type { ImportRow } from '../../shared/utils/csv-import'
import { cleanFields, fieldsProblem } from '../../shared/utils/field-changes'
import { normalizeFieldValue } from '../../shared/utils/field-values'
import {
  blueprints,
  collectionItems,
  collections,
  libraryItems,
} from '../db/schema'
import type { IgdbGame } from './igdb-queries'

export interface ImportResult {
  /** Games added to the collection by this request. */
  added: number
  /** Games that were already in it, updated with the file's values. */
  updated: number
  /** Games linked to an IGDB game. */
  linked: number
  /** Games added by hand: no IGDB id, or one IGDB doesn't know. */
  handAdded: number
  /** Values the server refused (the browser checks first, so rarely any). */
  rejectedValues: number
}

/**
 * The fields after import must keep every current field, with the same
 * type, and may only add choices and new fields. Imports never remove or
 * change what's there.
 */
function checkOnlyAdds(before: FieldDefinition[], after: FieldDefinition[]) {
  for (const field of before) {
    const kept = after.find((candidate) => candidate.id === field.id)
    const keepsChoices = (field.options ?? []).every((option) =>
      (kept?.options ?? []).includes(option),
    )
    if (!kept || kept.type !== field.type || !keepsChoices) {
      throw createError({
        statusCode: 400,
        statusMessage: 'An import can only add fields and choices',
      })
    }
  }
}

/** Covers for IGDB games, by id. Ids IGDB doesn't know are left out. */
async function igdbCovers(ids: number[]): Promise<Map<number, string | null>> {
  const covers = new Map<number, string | null>()
  if (!ids.length) return covers
  const games = await igdbRequest<Pick<IgdbGame, 'id' | 'cover'>[]>(
    'games',
    `fields id, cover.image_id; where id = (${ids.join(',')}); limit 500;`,
  )
  for (const game of games) covers.set(game.id, game.cover?.image_id ?? null)
  return covers
}

/** Only the values that fit their fields, and how many didn't. */
function validValues(fields: FieldDefinition[], values: ItemData) {
  const byId = new Map(fields.map((field) => [field.id, field]))
  const valid: ItemData = {}
  let rejected = 0
  for (const [id, raw] of Object.entries(values)) {
    const field = byId.get(id)
    const value = field ? normalizeFieldValue(field, raw) : undefined
    if (value === undefined) rejected += 1
    else if (value !== null) valid[id] = value
  }
  return { valid, rejected }
}

/**
 * Imports one chunk of games into a collection the user owns. The first
 * chunk also brings the fields after import (new fields and choices).
 * Games with an IGDB id the user already has are updated, not duplicated,
 * and only with the values the file has: empty cells never erase anything.
 * Every game ends up in the collection, at the end, in file order.
 */
export async function importIntoCollection(
  ownerId: string,
  collectionId: string,
  input: { fields?: FieldDefinition[]; rows: ImportRow[] },
): Promise<ImportResult> {
  const collection = await getOwnedCollection(ownerId, collectionId)
  const db = useDb()
  const [blueprint] = await db
    .select()
    .from(blueprints)
    .where(eq(blueprints.id, collection.blueprintId))
  if (!blueprint)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  let fields = blueprint.fields
  if (input.fields) {
    const next = cleanFields(input.fields)
    checkOnlyAdds(fields, next)
    const problem = fieldsProblem(next)
    if (problem)
      throw createError({ statusCode: 400, statusMessage: problem.key })
    await db
      .update(blueprints)
      .set({ fields: next })
      .where(eq(blueprints.id, blueprint.id))
    fields = next
  }

  // The same IGDB game twice in a file is one game, with both rows' values.
  const merged = new Map<string, ImportRow>()
  input.rows.forEach((row, index) => {
    const key = row.igdbId === null ? `hand:${index}` : `igdb:${row.igdbId}`
    const earlier = merged.get(key)
    merged.set(
      key,
      earlier
        ? { ...earlier, values: { ...earlier.values, ...row.values } }
        : row,
    )
  })
  const rows = [...merged.values()]

  const covers = await igdbCovers([
    ...new Set(
      rows.flatMap((row) => (row.igdbId === null ? [] : [row.igdbId])),
    ),
  ])
  const known = (row: ImportRow) =>
    row.igdbId !== null && covers.has(row.igdbId)

  const existing = covers.size
    ? await db
        .select({
          id: libraryItems.id,
          igdbId: libraryItems.igdbId,
          data: libraryItems.data,
        })
        .from(libraryItems)
        .where(
          and(
            eq(libraryItems.ownerId, ownerId),
            inArray(libraryItems.igdbId, [...covers.keys()]),
          ),
        )
    : []
  const existingByIgdb = new Map(existing.map((item) => [item.igdbId!, item]))

  let rejectedValues = 0
  const toInsert: (typeof libraryItems.$inferInsert)[] = []
  const toUpdate: { id: string; data: ItemData }[] = []
  // The library item each row ends up as, filled in below, in file order.
  const order: (string | { pending: number })[] = []

  for (const row of rows) {
    const { valid, rejected } = validValues(fields, row.values)
    rejectedValues += rejected
    const have = known(row) ? existingByIgdb.get(row.igdbId!) : undefined
    if (have) {
      if (Object.keys(valid).length) {
        toUpdate.push({ id: have.id, data: { ...have.data, ...valid } })
      }
      order.push(have.id)
    } else {
      order.push({ pending: toInsert.length })
      toInsert.push({
        ownerId,
        igdbId: known(row) ? row.igdbId : null,
        name: row.name,
        coverId: known(row) ? (covers.get(row.igdbId!) ?? null) : null,
        data: valid,
      })
    }
  }

  const inserted = toInsert.length
    ? await db
        .insert(libraryItems)
        .values(toInsert)
        .returning({ id: libraryItems.id })
    : []
  if (toUpdate.length) {
    await db.execute(sql`
      update library_items as item
      set data = changed.data
      from (values ${sql.join(
        toUpdate.map(
          (update) =>
            sql`(${update.id}::uuid, ${JSON.stringify(update.data)}::jsonb)`,
        ),
        sql`, `,
      )}) as changed(id, data)
      where item.id = changed.id and item.owner_id = ${ownerId}
    `)
  }
  const itemIds = order.map((entry) =>
    typeof entry === 'string' ? entry : inserted[entry.pending]!.id,
  )

  const [{ last } = { last: 0 }] = await db
    .select({ last: max(collectionItems.position) })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, collection.id))
  const added = itemIds.length
    ? await db
        .insert(collectionItems)
        .values(
          itemIds.map((itemId, index) => ({
            collectionId: collection.id,
            itemId,
            position: (last ?? 0) + index + 1,
          })),
        )
        .onConflictDoNothing()
        .returning({ itemId: collectionItems.itemId })
    : []

  await db
    .update(collections)
    .set({ updatedAt: new Date() })
    .where(eq(collections.id, collection.id))

  return {
    added: added.length,
    updated: itemIds.length - added.length,
    linked: rows.filter(known).length,
    handAdded: rows.filter((row) => !known(row)).length,
    rejectedValues,
  }
}
