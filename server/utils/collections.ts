import { and, asc, count, eq, inArray, max, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type {
  Blueprint,
  CollectionDetail,
  CollectionEntry,
  CollectionSummary,
  LibraryItem,
} from '../../shared/types/collection'
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

  const items: CollectionEntry[] = entries.map((entry) => ({
    ...toLibraryItem(entry.item),
    addedAt: entry.addedAt.toISOString(),
  }))
  return {
    ...toSummary(found.collection, items.length),
    blueprint: toBlueprint(found.blueprint),
    items,
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

/** Creates a collection with a private copy of a starter blueprint. */
export async function createCollection(
  ownerId: string,
  input: {
    title: string
    description: string | null
    starter: StarterBlueprint
  },
): Promise<CollectionSummary> {
  const db = useDb()
  const blueprintId = crypto.randomUUID()
  try {
    const [, [created]] = await db.batch([
      db.insert(blueprints).values({
        id: blueprintId,
        ownerId,
        fields: starterFields(input.starter),
      }),
      db
        .insert(collections)
        .values({
          ownerId,
          blueprintId,
          title: input.title,
          slug: slugify(input.title),
          description: input.description,
        })
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
