import { and, asc, count, eq, inArray, max, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type {
  Blueprint,
  BlueprintCollection,
  BlueprintDetail,
  BlueprintImpact,
  BlueprintSummary,
  CollectionDetail,
  CollectionEntry,
  CollectionSummary,
  FieldDefinition,
  ItemData,
  LibraryItem,
} from '../../shared/types/collection'
import {
  cleanFields,
  fieldsProblem,
  migrateItemData,
  valuesLost,
  type OptionRenames,
} from '../../shared/utils/field-changes'
import { copyFields, copyValues } from '../../shared/utils/blueprint-names'
import { applyFieldValues } from '../../shared/utils/field-values'
import { slugify } from '../../shared/utils/slug'
import {
  starterFields,
  type StarterBlueprint,
} from '../../shared/utils/starter-blueprints'
import {
  blueprints,
  collectionItems,
  collections,
  libraryItems,
} from '../db/schema'
import { isUniqueViolation } from './db-errors'
import { positionBetween } from './positions'

type CollectionRow = typeof collections.$inferSelect
type BlueprintRow = typeof blueprints.$inferSelect
type ItemRow = typeof libraryItems.$inferSelect

const notFound = () =>
  createError({ statusCode: 404, statusMessage: 'Not found' })

function toSummary(row: CollectionRow, itemCount: number): CollectionSummary {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    visibility: row.visibility,
    kind: row.kind,
    itemCount,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toBlueprint(row: BlueprintRow): Blueprint {
  return { id: row.id, name: row.name, shared: row.shared, fields: row.fields }
}

export function toLibraryItem(row: ItemRow): LibraryItem {
  return {
    id: row.id,
    igdbId: row.igdbId,
    name: row.name,
    coverId: row.coverId,
    data: row.data,
  }
}

/**
 * Creates the user's Wishlist (with an empty blueprint) if they don't have
 * one. Called when the user's row is first created.
 */
export async function ensureWishlist(ownerId: string): Promise<void> {
  const db = useDb()
  const [existing] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(
      and(eq(collections.ownerId, ownerId), eq(collections.kind, 'wishlist')),
    )
  if (existing) return

  const blueprintId = crypto.randomUUID()
  const [, inserted] = await db.batch([
    db.insert(blueprints).values({
      id: blueprintId,
      ownerId,
      fields: starterFields('wishlist'),
    }),
    db
      .insert(collections)
      .values({
        ownerId,
        blueprintId,
        title: 'Wishlist',
        slug: 'wishlist',
        kind: 'wishlist',
      })
      .onConflictDoNothing()
      .returning({ id: collections.id }),
  ])
  // Another request created it first: drop the unused blueprint.
  if (inserted.length === 0) {
    await db.delete(blueprints).where(eq(blueprints.id, blueprintId))
  }
}

/** A user's collections, Wishlist first, with item counts. */
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
    .orderBy(sql`${collections.kind} = 'wishlist' desc`, asc(collections.title))
  return rows.map((row) => toSummary(row.collection, row.itemCount))
}

/** One collection with its blueprint and items, or 404 if it isn't visible. */
/**
 * Which of a collection's items are also on the owner's Wishlist, or null
 * when that isn't shown: on the Wishlist itself, or to visitors while the
 * Wishlist is private.
 */
async function wishlistedItemIds(
  ownerId: string,
  collection: CollectionRow,
  itemIds: string[],
  viewerIsOwner: boolean,
): Promise<Set<string> | null> {
  if (collection.kind === 'wishlist') return null
  const db = useDb()
  const [wishlist] = await db
    .select({ id: collections.id, visibility: collections.visibility })
    .from(collections)
    .where(
      and(eq(collections.ownerId, ownerId), eq(collections.kind, 'wishlist')),
    )
  if (!wishlist || (!viewerIsOwner && wishlist.visibility !== 'public')) {
    return null
  }
  if (!itemIds.length) return new Set()
  const rows = await db
    .select({ itemId: collectionItems.itemId })
    .from(collectionItems)
    .where(
      and(
        eq(collectionItems.collectionId, wishlist.id),
        inArray(collectionItems.itemId, itemIds),
      ),
    )
  return new Set(rows.map((row) => row.itemId))
}

export async function getCollectionBySlug(
  ownerId: string,
  slug: string,
  viewerIsOwner: boolean,
): Promise<CollectionDetail> {
  const db = useDb()
  const [found] = await db
    .select({ collection: collections, blueprint: blueprints })
    .from(collections)
    .innerJoin(blueprints, eq(blueprints.id, collections.blueprintId))
    .where(and(eq(collections.ownerId, ownerId), eq(collections.slug, slug)))
  if (!found) throw notFound()
  if (!viewerIsOwner && found.collection.visibility !== 'public')
    throw notFound()

  const entries = await db
    .select({ item: libraryItems, addedAt: collectionItems.addedAt })
    .from(collectionItems)
    .innerJoin(libraryItems, eq(libraryItems.id, collectionItems.itemId))
    .where(eq(collectionItems.collectionId, found.collection.id))
    .orderBy(asc(collectionItems.position), asc(collectionItems.addedAt))

  const wishlisted = await wishlistedItemIds(
    ownerId,
    found.collection,
    entries.map((entry) => entry.item.id),
    viewerIsOwner,
  )
  const items: CollectionEntry[] = entries.map((entry) => ({
    ...toLibraryItem(entry.item),
    addedAt: entry.addedAt.toISOString(),
    ...(wishlisted && { wishlisted: wishlisted.has(entry.item.id) }),
  }))
  const blueprint = toBlueprint(found.blueprint)
  if (viewerIsOwner) {
    blueprint.usedBy = found.blueprint.shared
      ? await countCollectionsUsing(ownerId, found.blueprint.id)
      : 1
  }
  return {
    ...toSummary(found.collection, items.length),
    blueprint,
    items,
    isOwner: viewerIsOwner,
  }
}

/** How many of the user's collections use a blueprint. */
async function countCollectionsUsing(
  ownerId: string,
  blueprintId: string,
): Promise<number> {
  const [{ value } = { value: 0 }] = await useDb()
    .select({ value: count() })
    .from(collections)
    .where(
      and(
        eq(collections.ownerId, ownerId),
        eq(collections.blueprintId, blueprintId),
      ),
    )
  return value
}

/** A blueprint the user owns, or 404. */
async function getOwnedBlueprint(
  ownerId: string,
  blueprintId: string,
): Promise<BlueprintRow> {
  const [row] = await useDb()
    .select()
    .from(blueprints)
    .where(and(eq(blueprints.id, blueprintId), eq(blueprints.ownerId, ownerId)))
  if (!row) throw notFound()
  return row
}

/** The user's blueprints (shared blueprints), by name. */
export async function listBlueprints(
  ownerId: string,
): Promise<BlueprintSummary[]> {
  const rows = await useDb()
    .select({
      id: blueprints.id,
      name: blueprints.name,
      fieldCount: sql<number>`jsonb_array_length(${blueprints.fields})::int`,
      // Spelled out: Drizzle leaves the outer table off the column, so the
      // subquery would compare collections with itself.
      usedBy: sql<number>`(
        select count(*)::int from collections as used
        where used.blueprint_id = blueprints.id
      )`,
    })
    .from(blueprints)
    .where(and(eq(blueprints.ownerId, ownerId), eq(blueprints.shared, true)))
    .orderBy(sql`lower(${blueprints.name})`, asc(blueprints.createdAt))
  return rows.map((row) => ({
    id: row.id,
    name: row.name ?? '',
    fieldCount: row.fieldCount,
    usedBy: row.usedBy,
  }))
}

/**
 * Turns a collection's private blueprint into a named blueprint the user
 * can pick for new collections. The collection keeps using it. 409 when
 * another of the user's sets has the same name, ignoring case.
 */
export async function shareCollectionFields(
  ownerId: string,
  collectionId: string,
  name: string,
): Promise<Blueprint> {
  const collection = await getOwnedCollection(ownerId, collectionId)
  const current = await getOwnedBlueprint(ownerId, collection.blueprintId)
  if (current.shared) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Already a blueprint',
    })
  }
  const db = useDb()
  // The name check sits in the update itself, so the row is only changed
  // when no other set of the user's has that name.
  const [saved] = await db
    .update(blueprints)
    .set({ shared: true, name })
    .where(
      and(
        eq(blueprints.id, current.id),
        eq(blueprints.ownerId, ownerId),
        sql`not exists (
          select 1 from ${blueprints} as other
          where other.owner_id = ${ownerId}
            and other.shared
            and lower(other.name) = lower(${name})
            and other.id <> ${current.id}
        )`,
      ),
    )
    .returning()
  if (!saved) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Blueprint name taken',
    })
  }
  return { ...toBlueprint(saved), usedBy: 1 }
}

/**
 * Gives a collection its own private copy of the blueprint it uses. The
 * copy keeps every field id, so stored values stay valid. The user's other
 * collections keep the set.
 */
export async function detachCollectionFields(
  ownerId: string,
  collectionId: string,
): Promise<Blueprint> {
  const collection = await getOwnedCollection(ownerId, collectionId)
  const set = await getOwnedBlueprint(ownerId, collection.blueprintId)
  if (!set.shared) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Not a blueprint',
    })
  }
  const db = useDb()
  const blueprintId = crypto.randomUUID()
  // New field ids, with this collection's values copied over, so the copy
  // shares nothing with the blueprint's other collections.
  const { fields, idMap } = copyFields(set.fields)
  const games = await db
    .select({ id: libraryItems.id, data: libraryItems.data })
    .from(collectionItems)
    .innerJoin(libraryItems, eq(libraryItems.id, collectionItems.itemId))
    .where(eq(collectionItems.collectionId, collection.id))
  const valueCopies = games.flatMap((game) => {
    const data = copyValues(game.data, idMap)
    return data
      ? [
          db
            .update(libraryItems)
            .set({ data })
            .where(eq(libraryItems.id, game.id)),
        ]
      : []
  })
  const [[copy]] = await db.batch([
    db
      .insert(blueprints)
      .values({ id: blueprintId, ownerId, fields })
      .returning(),
    db
      .update(collections)
      .set({ blueprintId })
      .where(
        and(
          eq(collections.id, collection.id),
          eq(collections.ownerId, ownerId),
        ),
      ),
    ...valueCopies,
  ])
  return { ...toBlueprint(copy!), usedBy: 1 }
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

/**
 * Creates a collection with either a private copy of a starter blueprint,
 * or one of the user's blueprints, used as is. A `blueprintId` that isn't
 * one of the user's sets is a 404.
 */
export async function createCollection(
  ownerId: string,
  input: {
    title: string
    description: string | null
  } & (
    | { starter: StarterBlueprint }
    /** `copy` gives the collection its own copy of the blueprint's fields. */
    | { blueprintId: string; copy?: boolean }
  ),
): Promise<CollectionSummary> {
  const db = useDb()
  const details = {
    ownerId,
    title: input.title,
    slug: slugify(input.title),
    description: input.description,
  }
  try {
    if ('blueprintId' in input) {
      const set = await getOwnedBlueprint(ownerId, input.blueprintId)
      if (!set.shared) throw notFound()
      if (!input.copy) {
        const [created] = await db
          .insert(collections)
          .values({ ...details, blueprintId: set.id })
          .returning()
        return toSummary(created!, 0)
      }
      const blueprintId = crypto.randomUUID()
      const [, [created]] = await db.batch([
        db.insert(blueprints).values({
          id: blueprintId,
          ownerId,
          fields: copyFields(set.fields).fields,
        }),
        db
          .insert(collections)
          .values({ ...details, blueprintId })
          .returning(),
      ])
      return toSummary(created!, 0)
    }
    const blueprintId = crypto.randomUUID()
    const [, [created]] = await db.batch([
      db.insert(blueprints).values({
        id: blueprintId,
        ownerId,
        fields: starterFields(input.starter),
      }),
      db
        .insert(collections)
        .values({ ...details, blueprintId })
        .returning(),
    ])
    return toSummary(created!, 0)
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

/** Renames or edits a custom collection. The Wishlist's title is fixed. */
export async function updateCollection(
  ownerId: string,
  collectionId: string,
  changes: {
    title?: string
    description?: string | null
    visibility?: 'private' | 'public'
  },
): Promise<CollectionSummary> {
  const current = await getOwnedCollection(ownerId, collectionId)
  if (changes.title !== undefined && current.kind === 'wishlist') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Wishlist title is fixed',
    })
  }
  try {
    const [updated] = await useDb()
      .update(collections)
      .set({
        ...(changes.title !== undefined && {
          title: changes.title,
          slug: slugify(changes.title),
        }),
        ...(changes.description !== undefined && {
          description: changes.description,
        }),
        ...(changes.visibility !== undefined && {
          visibility: changes.visibility,
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
 * Deletes a custom collection, and its blueprint when that was private.
 * The games stay in the user's library and any other collections.
 */
export async function deleteCollection(
  ownerId: string,
  collectionId: string,
): Promise<void> {
  const current = await getOwnedCollection(ownerId, collectionId)
  if (current.kind === 'wishlist') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Wishlist cannot be deleted',
    })
  }
  const db = useDb()
  await db.delete(collections).where(eq(collections.id, current.id))
  await db
    .delete(blueprints)
    .where(
      and(eq(blueprints.id, current.blueprintId), eq(blueprints.shared, false)),
    )
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
 * one item per user, however many collections it's added to.
 */
export async function findOrCreateItem(
  ownerId: string,
  input: { igdbId: number | null; name: string; coverId: string | null },
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
    .values({ ownerId, ...input })
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

/** Adds an item to collections the user owns, at the end of each. */
export async function addItemToCollections(
  ownerId: string,
  itemId: string,
  collectionIds: string[],
): Promise<void> {
  if (collectionIds.length === 0) return
  const db = useDb()
  const owned = await db
    .select({ id: collections.id })
    .from(collections)
    .where(
      and(
        eq(collections.ownerId, ownerId),
        inArray(collections.id, collectionIds),
      ),
    )
  if (owned.length !== new Set(collectionIds).size) throw notFound()

  const ends = await db
    .select({
      id: collectionItems.collectionId,
      last: max(collectionItems.position),
    })
    .from(collectionItems)
    .where(inArray(collectionItems.collectionId, collectionIds))
    .groupBy(collectionItems.collectionId)
  const lastPosition = new Map(ends.map((row) => [row.id, row.last ?? 0]))

  await db
    .insert(collectionItems)
    .values(
      [...new Set(collectionIds)].map((collectionId) => ({
        collectionId,
        itemId,
        position: (lastPosition.get(collectionId) ?? 0) + 1,
      })),
    )
    .onConflictDoNothing()
}

/**
 * Moves an item from one of the user's collections to others, like "Got
 * it" taking a game off the Wishlist into a collection. It goes at the end
 * of each target. Adding and removing happen in one batch, so the game is
 * never in neither.
 */
export async function moveItemToCollections(
  ownerId: string,
  fromCollectionId: string,
  itemId: string,
  toCollectionIds: string[],
): Promise<void> {
  const targets = [...new Set(toCollectionIds)].filter(
    (id) => id !== fromCollectionId,
  )
  if (!targets.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No target collection',
    })
  }
  await getOwnedCollection(ownerId, fromCollectionId)
  const db = useDb()
  const [membership] = await db
    .select({ itemId: collectionItems.itemId })
    .from(collectionItems)
    .where(
      and(
        eq(collectionItems.collectionId, fromCollectionId),
        eq(collectionItems.itemId, itemId),
      ),
    )
  if (!membership) throw notFound()
  const owned = await db
    .select({ id: collections.id })
    .from(collections)
    .where(
      and(eq(collections.ownerId, ownerId), inArray(collections.id, targets)),
    )
  if (owned.length !== targets.length) throw notFound()

  const ends = await db
    .select({
      id: collectionItems.collectionId,
      last: max(collectionItems.position),
    })
    .from(collectionItems)
    .where(inArray(collectionItems.collectionId, targets))
    .groupBy(collectionItems.collectionId)
  const lastPosition = new Map(ends.map((row) => [row.id, row.last ?? 0]))

  await db.batch([
    db
      .insert(collectionItems)
      .values(
        targets.map((collectionId) => ({
          collectionId,
          itemId,
          position: (lastPosition.get(collectionId) ?? 0) + 1,
        })),
      )
      .onConflictDoNothing(),
    db
      .delete(collectionItems)
      .where(
        and(
          eq(collectionItems.collectionId, fromCollectionId),
          eq(collectionItems.itemId, itemId),
        ),
      ),
  ])
}

export async function removeItemFromCollection(
  collectionId: string,
  itemId: string,
): Promise<void> {
  await useDb()
    .delete(collectionItems)
    .where(
      and(
        eq(collectionItems.collectionId, collectionId),
        eq(collectionItems.itemId, itemId),
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
 * Sets an item's values for the fields of one collection's blueprint. The
 * item must be in that collection. Returns 400 with the rejected field ids
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
    .select({ item: libraryItems, fields: blueprints.fields })
    .from(collectionItems)
    .innerJoin(collections, eq(collections.id, collectionItems.collectionId))
    .innerJoin(blueprints, eq(blueprints.id, collections.blueprintId))
    .innerJoin(libraryItems, eq(libraryItems.id, collectionItems.itemId))
    .where(
      and(
        eq(collectionItems.collectionId, collectionId),
        eq(collectionItems.itemId, itemId),
        eq(collections.ownerId, ownerId),
      ),
    )
  if (!found) throw notFound()

  const result = applyFieldValues(found.item.data, found.fields, changes)
  if ('invalidFieldIds' in result) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid field values',
      data: { invalidFieldIds: result.invalidFieldIds },
    })
  }
  const [updated] = await db
    .update(libraryItems)
    .set({ data: result.data })
    .where(eq(libraryItems.id, itemId))
    .returning()
  return toLibraryItem(updated!)
}

/**
 * The user's items for the given IGDB games that are in a collection: any
 * of their collections, or only `collectionId` when given. Lets search
 * results mark games the user already has, and remove them in one click.
 */
export async function trackedItems(
  ownerId: string,
  igdbIds: number[],
  collectionId?: string,
): Promise<{ igdbId: number; itemId: string }[]> {
  if (igdbIds.length === 0) return []
  const rows = await useDb()
    .selectDistinct({ igdbId: libraryItems.igdbId, itemId: libraryItems.id })
    .from(libraryItems)
    .innerJoin(collectionItems, eq(collectionItems.itemId, libraryItems.id))
    .where(
      and(
        eq(libraryItems.ownerId, ownerId),
        inArray(libraryItems.igdbId, igdbIds),
        collectionId
          ? eq(collectionItems.collectionId, collectionId)
          : undefined,
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
  /** The owner's games whose stored values change, with their new values. */
  updates: { id: string; data: ItemData }[]
}

async function planFieldChanges(
  ownerId: string,
  blueprint: BlueprintRow,
  input: FieldDefinition[],
  optionRenames: OptionRenames,
): Promise<FieldChangePlan> {
  const fields = cleanFields(input)
  const problem = fieldsProblem(fields)
  if (problem) {
    throw createError({ statusCode: 400, statusMessage: problem.key })
  }

  // Only renames from an option that existed to one that still does.
  const before = blueprint.fields
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
  const items = touched.length
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
  const updates = items.flatMap((item) => {
    const data = migrateItemData(item.data, before, fields, renames)
    return data ? [{ id: item.id, data }] : []
  })
  return { before, fields, renames, updates }
}

/**
 * Replaces a blueprint's fields and carries the owner's stored values over:
 * values for removed fields are dropped, values for changed fields
 * converted or dropped when they no longer fit, renamed select options
 * renamed. All in one batch, so it happens fully or not at all. Every
 * collection using the blueprint sees the change.
 */
export async function updateBlueprintFields(
  ownerId: string,
  blueprintId: string,
  input: FieldDefinition[],
  optionRenames: OptionRenames = {},
): Promise<Blueprint> {
  const blueprint = await getOwnedBlueprint(ownerId, blueprintId)
  const plan = await planFieldChanges(ownerId, blueprint, input, optionRenames)
  const db = useDb()
  const [[saved]] = await db.batch([
    db
      .update(blueprints)
      .set({ fields: plan.fields })
      .where(eq(blueprints.id, blueprint.id))
      .returning(),
    ...plan.updates.map((update) =>
      db
        .update(libraryItems)
        .set({ data: update.data })
        .where(eq(libraryItems.id, update.id)),
    ),
  ])
  return toBlueprint(saved!)
}

/** Replaces the fields of a collection the user owns. See above. */
export async function updateCollectionFields(
  ownerId: string,
  collectionId: string,
  input: FieldDefinition[],
  optionRenames: OptionRenames = {},
): Promise<Blueprint> {
  const collection = await getOwnedCollection(ownerId, collectionId)
  return updateBlueprintFields(
    ownerId,
    collection.blueprintId,
    input,
    optionRenames,
  )
}

/** The owner's collections using a blueprint, with how many games each has. */
async function collectionsUsing(
  ownerId: string,
  blueprintId: string,
): Promise<BlueprintCollection[]> {
  const rows = await useDb()
    .select({
      id: collections.id,
      title: collections.title,
      slug: collections.slug,
      kind: collections.kind,
      itemCount: sql<number>`(
        select count(*)::int from collection_items as entry
        where entry.collection_id = collections.id
      )`,
    })
    .from(collections)
    .where(
      and(
        eq(collections.ownerId, ownerId),
        eq(collections.blueprintId, blueprintId),
      ),
    )
    .orderBy(sql`lower(${collections.title})`)
  return rows
}

/**
 * What saving new fields on a blueprint would change, without saving: the
 * collections that use it, and per field how many of their games would
 * lose a value.
 */
export async function previewBlueprintFields(
  ownerId: string,
  blueprintId: string,
  input: FieldDefinition[],
  optionRenames: OptionRenames = {},
): Promise<BlueprintImpact> {
  const blueprint = await getOwnedBlueprint(ownerId, blueprintId)
  const plan = await planFieldChanges(ownerId, blueprint, input, optionRenames)
  const using = await collectionsUsing(ownerId, blueprint.id)
  const games = using.length
    ? await useDb()
        .selectDistinct({ id: libraryItems.id, data: libraryItems.data })
        .from(collectionItems)
        .innerJoin(libraryItems, eq(libraryItems.id, collectionItems.itemId))
        .where(
          inArray(
            collectionItems.collectionId,
            using.map((collection) => collection.id),
          ),
        )
    : []
  const lost = valuesLost(games, plan.before, plan.fields, plan.renames)
  return {
    collections: using,
    lost: plan.before
      .filter((field) => lost.has(field.id))
      .map((field) => ({ name: field.name, count: lost.get(field.id)! })),
  }
}

/** A blueprint with the collections that use it, for its own page. */
export async function getBlueprintDetail(
  ownerId: string,
  blueprintId: string,
): Promise<BlueprintDetail> {
  const blueprint = await getOwnedBlueprint(ownerId, blueprintId)
  if (!blueprint.shared) throw notFound()
  const using = await collectionsUsing(ownerId, blueprint.id)
  return {
    ...toBlueprint(blueprint),
    usedBy: using.length,
    collections: using,
  }
}

/** Renames one of the user's blueprints. Names are unique per user. */
export async function renameBlueprint(
  ownerId: string,
  blueprintId: string,
  name: string,
): Promise<Blueprint> {
  const blueprint = await getOwnedBlueprint(ownerId, blueprintId)
  if (!blueprint.shared) throw notFound()
  const [saved] = await useDb()
    .update(blueprints)
    .set({ name })
    .where(
      and(
        eq(blueprints.id, blueprint.id),
        sql`not exists (
          select 1 from ${blueprints} as other
          where other.owner_id = ${ownerId}
            and other.shared
            and lower(other.name) = lower(${name})
            and other.id <> ${blueprint.id}
        )`,
      ),
    )
    .returning()
  if (!saved) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Blueprint name taken',
    })
  }
  return toBlueprint(saved)
}

/** Deletes one of the user's blueprints, once no collection uses it. */
export async function deleteBlueprint(
  ownerId: string,
  blueprintId: string,
): Promise<void> {
  const blueprint = await getOwnedBlueprint(ownerId, blueprintId)
  if (!blueprint.shared) throw notFound()
  if (await countCollectionsUsing(ownerId, blueprint.id)) {
    throw createError({ statusCode: 409, statusMessage: 'Blueprint in use' })
  }
  await useDb().delete(blueprints).where(eq(blueprints.id, blueprint.id))
}
