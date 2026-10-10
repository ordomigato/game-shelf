import { sql } from 'drizzle-orm'
import {
  check,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  uniqueIndex,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import type { ChartWidget } from '../../shared/types/charts'
import type { FieldDefinition, ItemData } from '../../shared/types/collection'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const visibility = pgEnum('visibility', ['private', 'public'])
export const collectionKind = pgEnum('collection_kind', ['custom', 'wishlist'])

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cognitoSub: text('cognito_sub').notNull().unique(),
    /** Chosen after the first sign-in. Null until then. */
    username: text('username').unique(),
    displayName: text('display_name'),
    ...timestamps,
  },
  (table) => [
    check(
      'users_username_format',
      sql`${table.username} ~ '^[a-z0-9_]{3,20}$'`,
    ),
  ],
)

/**
 * A set of field definitions. A shared blueprint has a name and can be used
 * by several collections. A private one (no name) belongs to one collection.
 */
export const blueprints = pgTable(
  'blueprints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name'),
    shared: boolean('shared').notNull().default(false),
    fields: jsonb('fields').$type<FieldDefinition[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [index('blueprints_owner_id_idx').on(table.ownerId)],
)

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blueprintId: uuid('blueprint_id')
      .notNull()
      .references(() => blueprints.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    /** URL name, from the title. Unique per owner. */
    slug: text('slug').notNull(),
    description: text('description'),
    visibility: visibility('visibility').notNull().default('private'),
    kind: collectionKind('kind').notNull().default('custom'),
    /** The charts on the collection's dashboard, in order. */
    dashboard: jsonb('dashboard').$type<ChartWidget[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [
    index('collections_owner_id_idx').on(table.ownerId),
    uniqueIndex('collections_owner_slug_idx').on(table.ownerId, table.slug),
    uniqueIndex('collections_one_wishlist_idx')
      .on(table.ownerId)
      .where(sql`${table.kind} = 'wishlist'`),
  ],
)

/**
 * A game a user is tracking, once per game per user, however many
 * collections it's in. `data` holds its values for every blueprint field,
 * keyed by field id.
 */
export const libraryItems = pgTable(
  'library_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Set when the item came from IGDB. */
    igdbId: integer('igdb_id'),
    name: text('name').notNull(),
    coverId: text('cover_id'),
    data: jsonb('data').$type<ItemData>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index('library_items_owner_id_idx').on(table.ownerId),
    index('library_items_igdb_id_idx').on(table.igdbId),
    uniqueIndex('library_items_owner_igdb_idx')
      .on(table.ownerId, table.igdbId)
      .where(sql`${table.igdbId} is not null`),
  ],
)

/** Junction table: which library items are in which collections. */
export const collectionItems = pgTable(
  'collection_items',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => libraryItems.id, { onDelete: 'cascade' }),
    /**
     * The owner's order. A moved game goes halfway between its neighbours,
     * so a move writes one row. See `moveItemInCollection`.
     */
    position: doublePrecision('position').notNull().default(0),
    addedAt: timestamp('added_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.itemId] }),
    index('collection_items_item_id_idx').on(table.itemId),
  ],
)
