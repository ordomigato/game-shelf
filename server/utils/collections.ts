import { and, asc, count, eq, inArray, isNotNull, max, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { ChartWidget } from '../../shared/types/charts'
import type {
  CollectionDetail,
  CollectionEntry,
  CollectionLink,
  CollectionSummary,
  FieldDefinition,
  FieldsImpact,
  ItemData,
  LibraryItem,
  ListName,
  PlatformOption,
} from '../../shared/types/collection'
import {
  cleanFields,
  fieldsProblem,
  migrateItemData,
  valuesLost,
  type OptionRenames,
} from '../../shared/utils/field-changes'
import {
  applyFieldValues,
  chartsFor,
  dataFor,
  fieldsFor,
} from '../../shared/utils/field-values'
import { slugify } from '../../shared/utils/slug'
import { knownHiddenColumns } from '../../shared/utils/columns'
import type { ListState } from '../../shared/utils/lists'
import {
  collectionItems,
  collections,
  games as catalogGames,
  libraryItems,
  platforms,
  users,
} from '../db/schema'
import { isForeignKeyViolation, isUniqueViolation } from './db-errors'
import { positionBetween } from './positions'

type CollectionRow = typeof collections.$inferSelect
type ItemRow = typeof libraryItems.$inferSelect
type CatalogGameRow = typeof catalogGames.$inferSelect

export const notFound = () =>
  createError({ statusCode: 404, statusMessage: 'Not found' })

function toSummary(row: CollectionRow, itemCount: number): CollectionSummary {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    color: row.color,
    visibility: row.visibility,
    itemCount,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Joins an item to its catalog game, once the catalog has read that game
 * from IGDB. Use with `leftJoin(games, ...)`, so items without one stay.
 */
export const catalogJoin = and(
  eq(catalogGames.igdbId, libraryItems.igdbId),
  isNotNull(catalogGames.fetchedAt),
)

/** The name to show for an item: its catalog game's, else its own. */
export const itemName = sql<string>`coalesce(${catalogGames.name}, ${libraryItems.name})`

/** The cover to show for an item: its catalog game's, else its own. */
export const itemCoverId = sql<
  string | null
>`case when ${catalogGames.igdbId} is null then ${libraryItems.coverId} else ${catalogGames.coverId} end`

/**
 * An item as the browser sees it. An IGDB game's name, cover, release
 * date and genres come from its catalog row (from `catalogJoin`), and the item's own
 * name and cover are used when there's none.
 */
export function toLibraryItem(
  row: ItemRow,
  game: CatalogGameRow | null,
): LibraryItem {
  return {
    id: row.id,
    igdbId: row.igdbId,
    name: game ? game.name : row.name,
    coverId: game ? game.coverId : row.coverId,
    releaseDate: game?.releaseDate ?? null,
    releasePrecision: game?.releasePrecision ?? null,
    genres: game?.genres ?? [],
    data: row.data,
    owned: row.owned,
    wishlisted: row.wishlisted,
    ownedOn: row.ownedOn,
    wantedOn: row.wantedOn,
  }
}

/** 404 unless every one of these collections is the user's. */
export async function assertOwnsCollections(
  ownerId: string,
  collectionIds: string[],
): Promise<void> {
  const asked = [...new Set(collectionIds)]
  if (!asked.length) return
  const rows = await useDb()
    .select({ id: collections.id })
    .from(collections)
    .where(
      and(eq(collections.ownerId, ownerId), inArray(collections.id, asked)),
    )
  if (rows.length !== asked.length) throw notFound()
}

/** The short name to show for each platform id. */
export async function platformNames(
  ids: number[],
): Promise<Map<number, string>> {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map()
  const rows = await useDb()
    .select({
      id: platforms.igdbId,
      name: sql<string>`coalesce(${platforms.abbreviation}, ${platforms.name})`,
    })
    .from(platforms)
    .where(inArray(platforms.igdbId, unique))
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** The catalog platforms of a game that have a name, in name order. */
export function catalogPlatformsOf(
  game: CatalogGameRow | null,
  names: Map<number, string>,
): PlatformOption[] {
  return (game?.platformIds ?? [])
    .flatMap((id) => {
      const name = names.get(id)
      return name === undefined ? [] : [{ id, name }]
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * A game in a collection or on a list as the viewer may see it. Only the
 * owner gets the flags, and every catalog platform to pick from. A visitor
 * gets the platforms the game is owned and wanted on, with their names, so
 * a public collection shows them as its owner sees them. On a public list
 * (`onlyList`) the visitor gets only that list's platforms, so Owned never
 * shows what the Wishlist holds, nor the other way round. They also get
 * `wanted`, to mark the games the owner is missing. The release date and
 * genres are public catalog facts for everyone.
 */
export function toCollectionEntry(
  row: ItemRow,
  game: CatalogGameRow | null,
  addedAt: Date,
  viewerIsOwner: boolean,
  names: Map<number, string> = new Map(),
  onlyList?: ListName,
): CollectionEntry {
  const { owned, wishlisted, ownedOn, wantedOn, ...item } = toLibraryItem(
    row,
    game,
  )
  if (viewerIsOwner) {
    return {
      ...item,
      addedAt: addedAt.toISOString(),
      wanted: wishlisted,
      owned,
      wishlisted,
      ownedOn,
      wantedOn,
      catalogPlatforms: catalogPlatformsOf(game, names),
    }
  }
  const shownOwned = onlyList === 'wishlist' ? [] : ownedOn
  const shownWanted = onlyList === 'owned' ? [] : wantedOn
  const shown = new Set([...shownOwned, ...shownWanted])
  return {
    ...item,
    addedAt: addedAt.toISOString(),
    wanted: onlyList ? onlyList === 'wishlist' : wishlisted,
    ownedOn: shownOwned,
    wantedOn: shownWanted,
    catalogPlatforms: catalogPlatformsOf(game, names).filter(({ id }) =>
      shown.has(id),
    ),
  }
}

/** The last position in each of these collections, by collection id. */
export async function lastPositions(
  collectionIds: string[],
): Promise<Map<string, number>> {
  const ends = await useDb()
    .select({
      id: collectionItems.collectionId,
      last: max(collectionItems.position),
    })
    .from(collectionItems)
    .where(inArray(collectionItems.collectionId, collectionIds))
    .groupBy(collectionItems.collectionId)
  return new Map(ends.map((row) => [row.id, row.last ?? 0]))
}

/** A user's collections by title, with item counts. */
export async function listCollections(
  ownerId: string,
  options: { publicOnly: boolean },
): Promise<CollectionSummary[]> {
  const rows = await useDb()
    .select({
      collection: collections,
      itemCount: count(collectionItems.itemId),
    })
    .from(collections)
    .leftJoin(collectionItems, eq(collectionItems.collectionId, collections.id))
    .where(
      and(
        eq(collections.ownerId, ownerId),
        options.publicOnly ? eq(collections.visibility, 'public') : undefined,
      ),
    )
    .groupBy(collections.id)
    .orderBy(asc(collections.title))
  return rows.map((row) => toSummary(row.collection, row.itemCount))
}

/**
 * The owner's collections each item is in, by title, for the lists
 * (owner only).
 */
export async function customCollectionsOf(
  ownerId: string,
  itemIds: string[],
): Promise<Map<string, CollectionLink[]>> {
  const byItem = new Map<string, CollectionLink[]>()
  if (!itemIds.length) return byItem
  const rows = await useDb()
    .select({
      itemId: collectionItems.itemId,
      id: collections.id,
      title: collections.title,
      slug: collections.slug,
      color: collections.color,
    })
    .from(collectionItems)
    .innerJoin(collections, eq(collections.id, collectionItems.collectionId))
    .where(
      and(
        eq(collections.ownerId, ownerId),
        inArray(collectionItems.itemId, itemIds),
      ),
    )
    .orderBy(sql`lower(${collections.title})`)
  for (const { itemId, ...link } of rows) {
    byItem.set(itemId, [...(byItem.get(itemId) ?? []), link])
  }
  return byItem
}

/** One collection with its owner's fields and items, or 404 if it isn't visible. */
export async function getCollectionBySlug(
  ownerId: string,
  slug: string,
  viewerIsOwner: boolean,
): Promise<CollectionDetail> {
  const db = useDb()
  const [found] = await db
    .select({ collection: collections, fields: users.fields })
    .from(collections)
    .innerJoin(users, eq(users.id, collections.ownerId))
    .where(and(eq(collections.ownerId, ownerId), eq(collections.slug, slug)))
  if (!found) throw notFound()
  if (!viewerIsOwner && found.collection.visibility !== 'public')
    throw notFound()

  const entries = await db
    .select({
      item: libraryItems,
      game: catalogGames,
      addedAt: collectionItems.addedAt,
    })
    .from(collectionItems)
    .innerJoin(libraryItems, eq(libraryItems.id, collectionItems.itemId))
    .leftJoin(catalogGames, catalogJoin)
    .where(eq(collectionItems.collectionId, found.collection.id))
    .orderBy(asc(collectionItems.position), asc(collectionItems.addedAt))

  // The owner sees which of their collections each game is in, for "Add to".
  const inCollections = viewerIsOwner
    ? await customCollectionsOf(
        ownerId,
        entries.map((entry) => entry.item.id),
      )
    : null
  const names = await platformNames(
    entries.flatMap((entry) => [
      ...(viewerIsOwner ? (entry.game?.platformIds ?? []) : []),
      ...entry.item.ownedOn,
      ...entry.item.wantedOn,
    ]),
  )
  const dashboard = chartsFor(
    viewerIsOwner,
    found.fields,
    found.collection.dashboard,
  )
  const rawItems: CollectionEntry[] = entries.map((entry) => ({
    ...toCollectionEntry(
      entry.item,
      entry.game,
      entry.addedAt,
      viewerIsOwner,
      names,
    ),
    ...(inCollections && {
      inCollections: inCollections.get(entry.item.id) ?? [],
    }),
  }))
  const fields = fieldsFor(viewerIsOwner, found.fields, rawItems, dashboard)
  const items = rawItems.map((item) => ({
    ...item,
    data: dataFor(viewerIsOwner, fields, item.data),
  }))
  return {
    ...toSummary(found.collection, items.length),
    fields,
    items,
    dashboard,
    // A visitor's table has only the fields they can see.
    hiddenColumns: knownHiddenColumns(
      found.collection.hiddenColumns,
      'collection',
      fields.map((field) => field.id),
    ),
    isOwner: viewerIsOwner,
  }
}

/** A collection the user owns, or 404. */
export async function getOwnedCollection(
  ownerId: string,
  collectionId: string,
): Promise<CollectionRow> {
  const [row] = await useDb()
    .select()
    .from(collections)
    .where(
      and(eq(collections.id, collectionId), eq(collections.ownerId, ownerId)),
    )
  if (!row) throw notFound()
  return row
}

const nameTaken = () =>
  createError({ statusCode: 409, statusMessage: 'Collection name taken' })

/** Creates a collection. 409 when the user has one with that address. */
export async function createCollection(
  ownerId: string,
  input: { title: string; description: string | null; color?: string | null },
): Promise<CollectionSummary> {
  try {
    const [created] = await useDb()
      .insert(collections)
      .values({
        ownerId,
        title: input.title,
        slug: slugify(input.title),
        description: input.description,
        color: input.color ?? null,
      })
      .returning()
    return toSummary(created!, 0)
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

/** Renames or edits a collection. */
export async function updateCollection(
  ownerId: string,
  collectionId: string,
  changes: {
    title?: string
    description?: string | null
    color?: string | null
    visibility?: 'private' | 'public'
    hiddenColumns?: string[]
  },
): Promise<CollectionSummary> {
  const current = await getOwnedCollection(ownerId, collectionId)
  try {
    const [updated] = await useDb()
      .update(collections)
      .set({
        ...(changes.title !== undefined && {
          title: changes.title,
          slug: slugify(changes.title),
        }),
        ...(changes.color !== undefined && { color: changes.color }),
        ...(changes.description !== undefined && {
          description: changes.description,
        }),
        ...(changes.visibility !== undefined && {
          visibility: changes.visibility,
        }),
        ...(changes.hiddenColumns !== undefined && {
          hiddenColumns: changes.hiddenColumns,
        }),
      })
      .where(eq(collections.id, current.id))
      .returning()
    const [{ value: itemCount } = { value: 0 }] = await useDb()
      .select({ value: count() })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, current.id))
    return toSummary(updated!, itemCount)
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

/**
 * Deletes a collection. The games stay in the user's library and any other
 * collections.
 */
export async function deleteCollection(
  ownerId: string,
  collectionId: string,
): Promise<void> {
  const current = await getOwnedCollection(ownerId, collectionId)
  await useDb().delete(collections).where(eq(collections.id, current.id))
}

/** The user's library item, or 404. */
export async function getOwnedItem(
  ownerId: string,
  itemId: string,
): Promise<ItemRow> {
  const [row] = await useDb()
    .select()
    .from(libraryItems)
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.ownerId, ownerId)))
  if (!row) throw notFound()
  return row
}

/**
 * The user's item for an IGDB game, created if needed. A game is only ever
 * one item per user, however many collections it's added to. A new item
 * starts in `state`. An existing one keeps its own.
 */
export async function findOrCreateItem(
  ownerId: string,
  input: { igdbId: number | null; name: string; coverId: string | null },
  state: ListState,
): Promise<ItemRow> {
  const db = useDb()
  if (input.igdbId !== null) {
    const [existing] = await db
      .select()
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.ownerId, ownerId),
          eq(libraryItems.igdbId, input.igdbId),
        ),
      )
    if (existing) return existing
  }
  const [created] = await db
    .insert(libraryItems)
    .values({ ownerId, ...input, ...state })
    .onConflictDoNothing()
    .returning()
  if (created) return created
  // Created by a concurrent request between the check and the insert.
  const [raced] = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.ownerId, ownerId),
        eq(libraryItems.igdbId, input.igdbId!),
      ),
    )
  if (!raced) throw new Error('Library item missing after insert conflict')
  return raced
}

/** Ids of the user's collections that contain an item. */
export async function collectionIdsForItem(itemId: string): Promise<string[]> {
  const rows = await useDb()
    .select({ id: collectionItems.collectionId })
    .from(collectionItems)
    .where(eq(collectionItems.itemId, itemId))
  return rows.map((row) => row.id)
}

/**
 * Adds an item to collections the user owns, at the end of each. The item's
 * Owned and Wishlist flags stay as they are. 404 when a collection isn't
 * the user's.
 */
export async function addItemToCollections(
  ownerId: string,
  itemId: string,
  collectionIds: string[],
): Promise<void> {
  const targets = [...new Set(collectionIds)]
  if (targets.length === 0) return
  await assertOwnsCollections(ownerId, targets)
  const lastPosition = await lastPositions(targets)
  try {
    await useDb()
      .insert(collectionItems)
      .values(
        targets.map((collectionId) => ({
          collectionId,
          itemId,
          position: (lastPosition.get(collectionId) ?? 0) + 1,
        })),
      )
      .onConflictDoNothing()
  } catch (error) {
    // The game or a collection was deleted since the checks above.
    if (isForeignKeyViolation(error)) throw notFound()
    throw error
  }
}

/**
 * Takes an item out of one of the user's collections (404 if it isn't
 * theirs). The game stays on its lists and in its other collections.
 */
export async function removeItemFromCollection(
  ownerId: string,
  collectionId: string,
  itemId: string,
): Promise<void> {
  const collection = await getOwnedCollection(ownerId, collectionId)
  await useDb()
    .delete(collectionItems)
    .where(
      and(
        eq(collectionItems.itemId, itemId),
        eq(collectionItems.collectionId, collection.id),
      ),
    )
}

/** A collection's items as shown: by position, then when they were added. */
async function orderedPositions(
  collectionId: string,
): Promise<{ itemId: string; position: number }[]> {
  return useDb()
    .select({
      itemId: collectionItems.itemId,
      position: collectionItems.position,
    })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, collectionId))
    .orderBy(asc(collectionItems.position), asc(collectionItems.addedAt))
}

/**
 * Moves an item to just after `afterItemId` in a collection the user owns,
 * or to the top when that's null. Writes only the moved row, halfway
 * between its new neighbours. When moves have squeezed two neighbours too
 * close together, the collection is renumbered 1, 2, 3… in one statement
 * first.
 */
export async function moveItemInCollection(
  ownerId: string,
  collectionId: string,
  itemId: string,
  afterItemId: string | null,
): Promise<void> {
  if (afterItemId === itemId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'An item cannot follow itself',
    })
  }
  await getOwnedCollection(ownerId, collectionId)
  const db = useDb()

  for (let attempt = 0; attempt < 2; attempt++) {
    const order = await orderedPositions(collectionId)
    if (!order.some((row) => row.itemId === itemId)) throw notFound()
    const others = order.filter((row) => row.itemId !== itemId)
    const index =
      afterItemId === null
        ? -1
        : others.findIndex((row) => row.itemId === afterItemId)
    if (afterItemId !== null && index === -1) throw notFound()

    const position = positionBetween(
      others[index]?.position ?? null,
      others[index + 1]?.position ?? null,
    )
    if (position !== null) {
      await db
        .update(collectionItems)
        .set({ position })
        .where(
          and(
            eq(collectionItems.collectionId, collectionId),
            eq(collectionItems.itemId, itemId),
          ),
        )
      return
    }
    await db.execute(sql`
      UPDATE collection_items AS ci
      SET position = ranked.rank
      FROM (
        SELECT item_id,
               row_number() OVER (ORDER BY position, added_at) AS rank
        FROM collection_items
        WHERE collection_id = ${collectionId}
      ) AS ranked
      WHERE ci.collection_id = ${collectionId}
        AND ci.item_id = ranked.item_id
    `)
  }
  throw new Error('Could not find room to move the item after renumbering')
}

/**
 * Sets an item's values for the user's fields. The item must be in that
 * collection. Returns 400 with the rejected field ids
 * when a value doesn't fit its field.
 */
export async function updateItemValues(
  ownerId: string,
  collectionId: string,
  itemId: string,
  changes: Record<string, unknown>,
): Promise<LibraryItem> {
  const db = useDb()
  const [found] = await db
    .select({
      item: libraryItems,
      game: catalogGames,
      fields: users.fields,
    })
    .from(collectionItems)
    .innerJoin(collections, eq(collections.id, collectionItems.collectionId))
    .innerJoin(users, eq(users.id, collections.ownerId))
    .innerJoin(libraryItems, eq(libraryItems.id, collectionItems.itemId))
    .leftJoin(catalogGames, catalogJoin)
    .where(
      and(
        eq(collectionItems.collectionId, collectionId),
        eq(collectionItems.itemId, itemId),
        eq(collections.ownerId, ownerId),
      ),
    )
  if (!found) throw notFound()
  return saveItemValues(found.item, found.game, found.fields, changes)
}

/**
 * Sets the values of one of the user's games for their fields, wherever it
 * is listed (a list or a collection). Same rules as `updateItemValues`.
 */
export async function updateLibraryItemValues(
  ownerId: string,
  itemId: string,
  changes: Record<string, unknown>,
): Promise<LibraryItem> {
  const [found] = await useDb()
    .select({
      item: libraryItems,
      game: catalogGames,
      fields: users.fields,
    })
    .from(libraryItems)
    .innerJoin(users, eq(users.id, libraryItems.ownerId))
    .leftJoin(catalogGames, catalogJoin)
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.ownerId, ownerId)))
  if (!found) throw notFound()
  return saveItemValues(found.item, found.game, found.fields, changes)
}

async function saveItemValues(
  item: ItemRow,
  game: CatalogGameRow | null,
  fields: FieldDefinition[],
  changes: Record<string, unknown>,
): Promise<LibraryItem> {
  const result = applyFieldValues(item.data, fields, changes)
  if ('invalidFieldIds' in result) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid field values',
      data: { invalidFieldIds: result.invalidFieldIds },
    })
  }
  const [updated] = await useDb()
    .update(libraryItems)
    .set({ data: result.data })
    .where(
      and(eq(libraryItems.id, item.id), eq(libraryItems.ownerId, item.ownerId)),
    )
    .returning()
  return toLibraryItem(updated!, game)
}

/**
 * The user's items for the given IGDB games, which are all on a list. Only
 * those in `collectionId`, or on `list`, when given. Lets search results
 * mark games the user already has, and remove them in one click.
 */
export async function trackedItems(
  ownerId: string,
  igdbIds: number[],
  only: { collectionId?: string; list?: ListName } = {},
): Promise<{ igdbId: number; itemId: string }[]> {
  if (igdbIds.length === 0) return []
  const query = useDb()
    .select({ igdbId: libraryItems.igdbId, itemId: libraryItems.id })
    .from(libraryItems)
  const rows = await (
    only.collectionId
      ? query.innerJoin(
          collectionItems,
          and(
            eq(collectionItems.itemId, libraryItems.id),
            eq(collectionItems.collectionId, only.collectionId),
          ),
        )
      : query
  ).where(
    and(
      eq(libraryItems.ownerId, ownerId),
      inArray(libraryItems.igdbId, igdbIds),
      only.list === 'owned' ? eq(libraryItems.owned, true) : undefined,
      only.list === 'wishlist' ? eq(libraryItems.wishlisted, true) : undefined,
    ),
  )
  return rows.flatMap((row) =>
    row.igdbId === null ? [] : [{ igdbId: row.igdbId, itemId: row.itemId }],
  )
}

/** Whether saving `after` can change stored values for field `before`. */
function touchesValues(
  before: FieldDefinition,
  after: FieldDefinition | undefined,
  renames: Record<string, string> | undefined,
): boolean {
  if (!after || after.type !== before.type) return true
  if (before.type === 'rating')
    return (before.scale ?? 5) !== (after.scale ?? 5)
  if (before.type !== 'select' && before.type !== 'multiselect') return false
  if (renames && Object.keys(renames).length) return true
  const kept = new Set(after.options ?? [])
  return (before.options ?? []).some((option) => !kept.has(option))
}

/** What saving new fields would do, worked out before anything is written. */
interface FieldChangePlan {
  before: FieldDefinition[]
  fields: FieldDefinition[]
  renames: OptionRenames
  /** The user's games that hold a value a change touches. */
  touchedItems: { id: string; data: ItemData }[]
  /** The games whose stored values change, with their new values. */
  updates: { id: string; data: ItemData }[]
}

/** The user's fields, in order. */
export async function getUserFields(
  ownerId: string,
): Promise<FieldDefinition[]> {
  const [row] = await useDb()
    .select({ fields: users.fields })
    .from(users)
    .where(eq(users.id, ownerId))
  return row?.fields ?? []
}

async function planFieldChanges(
  ownerId: string,
  before: FieldDefinition[],
  input: FieldDefinition[],
  optionRenames: OptionRenames,
): Promise<FieldChangePlan> {
  const fields = cleanFields(input)
  const problem = fieldsProblem(fields)
  if (problem) {
    throw createError({ statusCode: 400, statusMessage: problem.key })
  }

  // Only renames from an option that existed to one that still does.
  const afterById = new Map(fields.map((field) => [field.id, field]))
  const renames: OptionRenames = {}
  const isChoice = (type?: string) =>
    type === 'select' || type === 'multiselect'
  for (const field of before) {
    const after = afterById.get(field.id)
    const asked = optionRenames[field.id]
    if (!isChoice(field.type) || !isChoice(after?.type) || !asked) continue
    const valid = Object.entries(asked).filter(
      ([from, to]) =>
        (field.options ?? []).includes(from) &&
        (after!.options ?? []).includes(to),
    )
    if (valid.length) renames[field.id] = Object.fromEntries(valid)
  }

  const touched = before
    .filter((field) =>
      touchesValues(field, afterById.get(field.id), renames[field.id]),
    )
    .map((field) => field.id)
  const touchedItems = touched.length
    ? await useDb()
        .select({ id: libraryItems.id, data: libraryItems.data })
        .from(libraryItems)
        .where(
          and(
            eq(libraryItems.ownerId, ownerId),
            sql`${libraryItems.data} ?| ARRAY[${sql.join(
              touched.map((id) => sql`${id}`),
              sql`, `,
            )}]::text[]`,
          ),
        )
    : []
  const updates = touchedItems.flatMap((item) => {
    const data = migrateItemData(item.data, before, fields, renames)
    return data ? [{ id: item.id, data }] : []
  })
  return { before, fields, renames, touchedItems, updates }
}

/**
 * Replaces the user's fields and carries their games' stored values over:
 * values for removed fields are dropped, values for changed fields
 * converted or dropped when they no longer fit, renamed select options
 * renamed. All in one batch, so it happens fully or not at all. Every
 * collection sees the change.
 */
export async function updateUserFields(
  ownerId: string,
  input: FieldDefinition[],
  optionRenames: OptionRenames = {},
): Promise<FieldDefinition[]> {
  const before = await getUserFields(ownerId)
  const plan = await planFieldChanges(ownerId, before, input, optionRenames)
  const db = useDb()
  const [[saved]] = await db.batch([
    db
      .update(users)
      .set({ fields: plan.fields })
      .where(eq(users.id, ownerId))
      .returning({ fields: users.fields }),
    ...plan.updates.map((update) =>
      db
        .update(libraryItems)
        .set({ data: update.data })
        .where(eq(libraryItems.id, update.id)),
    ),
  ])
  return saved!.fields
}

/**
 * What saving new fields would change, without saving: per field, how many
 * of the user's games would lose a value.
 */
export async function previewUserFields(
  ownerId: string,
  input: FieldDefinition[],
  optionRenames: OptionRenames = {},
): Promise<FieldsImpact> {
  const before = await getUserFields(ownerId)
  const plan = await planFieldChanges(ownerId, before, input, optionRenames)
  const lost = valuesLost(
    plan.touchedItems,
    plan.before,
    plan.fields,
    plan.renames,
  )
  return {
    lost: plan.before
      .filter((field) => lost.has(field.id))
      .map((field) => ({ name: field.name, count: lost.get(field.id)! })),
  }
}

/** Replaces the charts on a collection's dashboard. */
export async function updateDashboard(
  ownerId: string,
  collectionId: string,
  dashboard: ChartWidget[],
): Promise<ChartWidget[]> {
  const collection = await getOwnedCollection(ownerId, collectionId)
  const [saved] = await useDb()
    .update(collections)
    .set({ dashboard })
    .where(eq(collections.id, collection.id))
    .returning({ dashboard: collections.dashboard })
  return saved!.dashboard
}
