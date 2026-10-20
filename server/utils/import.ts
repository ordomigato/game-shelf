import { and, eq, inArray, max, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { FieldDefinition, ItemData } from '../../shared/types/collection'
import type { ImportRow, PlatformProblem } from '../../shared/utils/csv-import'
import { cleanFields, fieldsProblem } from '../../shared/utils/field-changes'
import { normalizeFieldValue } from '../../shared/utils/field-values'
import {
  collectionItems,
  collections,
  libraryItems,
  platforms,
  users,
} from '../db/schema'
import type { PlanLimits } from '../../shared/utils/plans'

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
  /** Platform cells it couldn't use, for the person to see. */
  platformProblems: PlatformProblem[]
}

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/** An integer[] value in SQL. */
const intArray = (ids: number[]) =>
  ids.length
    ? sql`ARRAY[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::integer[]`
    : sql`'{}'::integer[]`

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
 * chunk also brings the user's fields after import (new fields and choices).
 * Games with an IGDB id the user already has are updated, not duplicated,
 * and only with the values the file has: empty cells never erase anything.
 * Every game ends up in the collection, at the end, in file order.
 *
 * Platform names in the file are matched, by name or short name, to the
 * platforms the catalog knows the game on, and ticked as owned. Names that
 * don't match, and platforms on a game that has none, come back as
 * `platformProblems`. A game on the Wishlist only isn't owned, so its
 * platforms are left alone and reported too.
 */
export async function importIntoCollection(
  ownerId: string,
  collectionId: string,
  limits: PlanLimits,
  input: { fields?: FieldDefinition[]; rows: ImportRow[] },
): Promise<ImportResult> {
  const collection = await getOwnedCollection(ownerId, collectionId)
  const db = useDb()
  let fields = await getUserFields(ownerId)
  if (input.fields) {
    const next = cleanFields(input.fields)
    checkOnlyAdds(fields, next)
    assertFieldRoom(fields, next, limits)
    const problem = fieldsProblem(next)
    if (problem)
      throw createError({ statusCode: 400, statusMessage: problem.key })
    await db.update(users).set({ fields: next }).where(eq(users.id, ownerId))
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

  // Covers for the IGDB games, by id, from the catalog (which reads the
  // ones it lacks from IGDB). Ids IGDB doesn't know are left out.
  const catalog = await ensureCatalogGames(
    rows.flatMap((row) => (row.igdbId === null ? [] : [row.igdbId])),
  )
  const covers = new Map(catalog.map((game) => [game.igdbId, game.coverId]))
  const known = (row: ImportRow) =>
    row.igdbId !== null && covers.has(row.igdbId)

  const existing = covers.size
    ? await db
        .select({
          id: libraryItems.id,
          igdbId: libraryItems.igdbId,
          data: libraryItems.data,
          owned: libraryItems.owned,
          ownedOn: libraryItems.ownedOn,
          wantedOn: libraryItems.wantedOn,
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

  // The platforms the file names, matched to each game's catalog platforms.
  const platformProblems: PlatformProblem[] = []
  const ownedOnAdd = new Map<number, Set<number>>()
  const asked = input.rows.filter((row) => row.platforms?.length)
  const catalogPlatforms = asked.length
    ? await db
        .select()
        .from(platforms)
        .where(
          inArray(platforms.igdbId, [
            ...new Set(catalog.flatMap((game) => game.platformIds)),
          ]),
        )
    : []
  for (const row of asked) {
    const names = row.platforms!
    const at = row.row ?? 0
    const game = known(row)
      ? catalog.find((candidate) => candidate.igdbId === row.igdbId)
      : undefined
    if (!game) {
      platformProblems.push({
        row: at,
        value: names.join('; '),
        reason: 'handAddedPlatforms',
      })
      continue
    }
    const onGame = catalogPlatforms.filter((platform) =>
      game.platformIds.includes(platform.igdbId),
    )
    const ids: number[] = []
    for (const name of names) {
      const found = onGame.find(
        (platform) =>
          sameName(platform.name, name) ||
          (platform.abbreviation !== null &&
            sameName(platform.abbreviation, name)),
      )
      if (found) ids.push(found.igdbId)
      else {
        platformProblems.push({
          row: at,
          value: name,
          reason: 'unknownPlatform',
        })
      }
    }
    // A game already in the library only takes platforms it can own.
    const have = existingByIgdb.get(game.igdbId)
    const wanted = new Set(have?.wantedOn)
    const usable =
      have && !have.owned ? [] : ids.filter((id) => !wanted.has(id))
    if (ids.length && have && !have.owned) {
      platformProblems.push({
        row: at,
        value: names.join('; '),
        reason: 'notOwnedPlatforms',
      })
    } else if (usable.length < ids.length) {
      platformProblems.push({
        row: at,
        value: names.join('; '),
        reason: 'wantedPlatforms',
      })
    }
    if (usable.length) {
      const set = ownedOnAdd.get(game.igdbId) ?? new Set<number>()
      usable.forEach((id) => set.add(id))
      ownedOnAdd.set(game.igdbId, set)
    }
  }

  let rejectedValues = 0
  const toInsert: (typeof libraryItems.$inferInsert)[] = []
  const toUpdate: { id: string; data: ItemData; ownedOn: number[] }[] = []
  // The library item each row ends up as, filled in below, in file order.
  const order: (string | { pending: number })[] = []

  for (const row of rows) {
    const { valid, rejected } = validValues(fields, row.values)
    rejectedValues += rejected
    const have = known(row) ? existingByIgdb.get(row.igdbId!) : undefined
    const extra = known(row) ? ownedOnAdd.get(row.igdbId!) : undefined
    if (have) {
      const ownedOn = [...new Set([...have.ownedOn, ...(extra ?? [])])].sort(
        (a, b) => a - b,
      )
      if (Object.keys(valid).length || ownedOn.length !== have.ownedOn.length) {
        toUpdate.push({
          id: have.id,
          data: { ...have.data, ...valid },
          ownedOn,
        })
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
        ownedOn: extra ? [...extra].sort((a, b) => a - b) : [],
      })
    }
  }

  // Within the plan: new games, and games new to this
  // collection (ones already in it only get their values updated).
  await assertLibraryRoom(ownerId, toInsert.length, limits)
  const alreadyIn = existing.length
    ? await db
        .select({ itemId: collectionItems.itemId })
        .from(collectionItems)
        .where(
          and(
            eq(collectionItems.collectionId, collection.id),
            inArray(
              collectionItems.itemId,
              existing.map((item) => item.id),
            ),
          ),
        )
    : []
  const inCollection = new Set(alreadyIn.map((row) => row.itemId))
  const newToCollection = order.filter(
    (entry) => typeof entry !== 'string' || !inCollection.has(entry),
  ).length
  await assertCollectionsRoom([collection.id], newToCollection, limits)

  const inserted = toInsert.length
    ? await db
        .insert(libraryItems)
        .values(toInsert)
        .returning({ id: libraryItems.id })
    : []
  if (toUpdate.length) {
    await db.execute(sql`
      update library_items as item
      set data = changed.data, owned_on = changed.owned_on
      from (values ${sql.join(
        toUpdate.map(
          (update) =>
            sql`(${update.id}::uuid, ${JSON.stringify(update.data)}::jsonb, ${intArray(update.ownedOn)})`,
        ),
        sql`, `,
      )}) as changed(id, data, owned_on)
      where item.id = changed.id and item.owner_id = ${ownerId}
    `)
  }
  const itemIds = order.map((entry) =>
    typeof entry === 'string' ? entry : inserted[entry.pending]!.id,
  )

  // New games are owned (the column's default). Games the user already
  // has keep their place on the lists.
  const [end] = await db
    .select({ last: max(collectionItems.position) })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, collection.id))
  const last = end?.last ?? 0
  const added = itemIds.length
    ? await db
        .insert(collectionItems)
        .values(
          itemIds.map((itemId, index) => ({
            collectionId: collection.id,
            itemId,
            position: last + index + 1,
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
    platformProblems,
  }
}
