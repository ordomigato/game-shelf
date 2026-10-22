import { sql } from 'drizzle-orm'
import {
  check,
  boolean,
  date,
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
import type { Role } from '../../shared/utils/access'
import type { ReleasePrecision } from '../../shared/utils/release-date'
import type { CustomLimits } from '../../shared/utils/plans'
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

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cognitoSub: text('cognito_sub').notNull().unique(),
    /** Chosen after the first sign-in. Null until then. */
    username: text('username').unique(),
    displayName: text('display_name'),
    /**
     * Roles beyond the implicit "user", set by hand. A new role needs a
     * migration that widens `users_roles` (see shared/utils/access.ts).
     */
    roles: text('roles')
      .array()
      .$type<Role[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** What the account may store (shared/utils/plans.ts). */
    plan: text('plan')
      .$type<'free' | 'pro' | 'max'>()
      .notNull()
      .default('free'),
    /** When a paid plan ends; null for free, or a plan that doesn't end. */
    planUntil: timestamp('plan_until', { withTimezone: true }),
    /**
     * Limits set by hand for this account (Max, or extra room for someone),
     * on top of the plan's. Null for most people.
     */
    customLimits: jsonb('custom_limits').$type<CustomLimits>(),
    /**
     * The extra fields the user keeps for their games, shared by every
     * game and collection. Values live in `library_items.data`, keyed by
     * field id.
     */
    fields: jsonb('fields').$type<FieldDefinition[]>().notNull().default([]),
    /**
     * The columns the owner hides on Owned and the Wishlist, as column keys
     * (shared/utils/columns.ts). A list with nothing saved shows them all.
     */
    listColumns: jsonb('list_columns')
      .$type<Partial<Record<'owned' | 'wishlist', string[]>>>()
      .notNull()
      .default({}),
    /**
     * Whether anyone with the link can open Owned, or the Wishlist. Both
     * start private, like a new collection.
     */
    ownedPublic: boolean('owned_public').notNull().default(false),
    wishlistPublic: boolean('wishlist_public').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    check(
      'users_username_format',
      sql`${table.username} ~ '^[a-z0-9_]{3,20}$'`,
    ),
    check('users_plan', sql`${table.plan} in ('free', 'pro', 'max')`),
    check('users_roles', sql`${table.roles} <@ array['admin']::text[]`),
  ],
)

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** URL name, from the title. Unique per owner. */
    slug: text('slug').notNull(),
    description: text('description'),
    /** A hex code like `#7c3aed`. Null means a colour from the title. */
    color: text('color'),
    visibility: visibility('visibility').notNull().default('private'),
    /** The charts on the collection's dashboard, in order. */
    dashboard: jsonb('dashboard').$type<ChartWidget[]>().notNull().default([]),
    /** Column keys the owner hides in this collection's table. */
    hiddenColumns: jsonb('hidden_columns')
      .$type<string[]>()
      .notNull()
      .default([]),
    ...timestamps,
  },
  (table) => [
    index('collections_owner_id_idx').on(table.ownerId),
    uniqueIndex('collections_owner_slug_idx').on(table.ownerId, table.slug),
  ],
)

/** IGDB platforms, for their names. Written only by the server, from IGDB. */
export const platforms = pgTable('platforms', {
  igdbId: integer('igdb_id').primaryKey(),
  name: text('name').notNull(),
  abbreviation: text('abbreviation'),
})

/**
 * One row per IGDB game anyone has added: the facts that are the same for
 * every user. Written only by the server from IGDB, never from what a
 * browser sends. See `server/utils/catalog.ts`.
 */
export const games = pgTable(
  'games',
  {
    igdbId: integer('igdb_id').primaryKey(),
    name: text('name').notNull(),
    coverId: text('cover_id'),
    /** IGDB's `first_release_date`, as a UTC day. */
    releaseDate: date('release_date', { mode: 'string' }),
    /**
     * How exact the date is: the day, or only its month, year or quarter,
     * or not announced. Null when unknown (not read from IGDB since this
     * was added).
     */
    releasePrecision: text('release_precision').$type<ReleasePrecision>(),
    /** Genre names. */
    genres: text('genres')
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** IGDB platform ids (`platforms.igdb_id`). */
    platformIds: integer('platform_ids')
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** When it was last read from IGDB. Null until it has been. */
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      'games_release_precision',
      sql`${table.releasePrecision} in ('day', 'month', 'year', 'quarter', 'tbd')`,
    ),
  ],
)

/**
 * A game a user is tracking, once per game per user, however many
 * collections it's in. `data` holds its values for the user's fields,
 * keyed by field id.
 *
 * Owned and the Wishlist are the `owned` and `wishlisted` flags, not
 * collections. `owned_on` and `wanted_on` name catalog platforms (versions)
 * for each, and the checks keep the two lists from overlapping: only a
 * different version of an owned game can also be wanted. See
 * `shared/utils/lists.ts`.
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
    owned: boolean('owned').notNull().default(true),
    wishlisted: boolean('wishlisted').notNull().default(false),
    /** Platform ids (`platforms.igdb_id`) the game is owned on. */
    ownedOn: integer('owned_on')
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Platform ids the game is wanted on. */
    wantedOn: integer('wanted_on')
      .array()
      .notNull()
      .default(sql`'{}'`),
    ...timestamps,
  },
  (table) => [
    index('library_items_owner_id_idx').on(table.ownerId),
    check(
      'library_items_platforms_apart',
      sql`not (${table.ownedOn} && ${table.wantedOn})`,
    ),
    check(
      'library_items_owned_on',
      sql`cardinality(${table.ownedOn}) = 0 or ${table.owned}`,
    ),
    check(
      'library_items_wanted_on',
      sql`cardinality(${table.wantedOn}) = 0 or ${table.wishlisted}`,
    ),
    check(
      'library_items_both_versions',
      sql`not (${table.owned} and ${table.wishlisted}) or cardinality(${table.wantedOn}) > 0`,
    ),
    check(
      'library_items_on_a_list',
      sql`${table.owned} or ${table.wishlisted}`,
    ),
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

/**
 * Collections a user pinned to the top of their sidebar, in their order.
 * Per user rather than a column on collections, so people sharing a
 * collection can pin it or not.
 */
export const pinnedCollections = pgTable(
  'pinned_collections',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    /** Halfway between neighbours on a move, like `collection_items`. */
    position: doublePrecision('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.collectionId] }),
    index('pinned_collections_collection_id_idx').on(table.collectionId),
  ],
)

/**
 * Counters for rate limits, one row per action and person (or address),
 * for the current fixed window. See `server/utils/rate-limit.ts`.
 */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull(),
})

/**
 * What we know about barcodes, from two sources (`source`):
 * - `scandex`: ScanDex's answer, so the same box isn't asked about twice. A
 *   row with no `igdbId` means ScanDex has no game for the barcode. One row
 *   per code. Matches are kept for good, no-match rows for a day.
 * - `user`: a game a user matched to the box themselves (Find it or Change in
 *   the scanner), saved when their batch is added. One row per user and code.
 *   It starts `pending`, and only the barcode reviewer approves or rejects
 *   it. Nothing is approved automatically. An approved row serves everyone,
 *   a pending one only its picker, a rejected one nobody. Approved rows
 *   outlive the account (`submitted_by` becomes null), pending and rejected
 *   ones go with it.
 * Keys are normalised (`shared/utils/barcode.ts`). See
 * `server/utils/barcodes.ts` and `server/utils/barcode-review.ts`.
 */
export const barcodeLookups = pgTable(
  'barcode_lookups',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    code: text('code').notNull(),
    source: text('source').$type<'scandex' | 'user'>().notNull(),
    igdbId: integer('igdb_id'),
    /** The IGDB platform (version) the box is for. */
    platformId: integer('platform_id'),
    platformName: text('platform_name'),
    /** The picker, for `user` rows. Null once their account is deleted. */
    submittedBy: uuid('submitted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Null for `scandex` rows, always set for `user` rows. */
    status: text('status').$type<'pending' | 'approved' | 'rejected'>(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** When an approved pick was sent to ScanDex. Null if it never was. */
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** When ScanDex answered, for `scandex` rows. */
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      'barcode_lookups_source',
      sql`${table.source} in ('scandex', 'user')`,
    ),
    check(
      'barcode_lookups_status',
      sql`${table.status} in ('pending', 'approved', 'rejected')`,
    ),
    check(
      'barcode_lookups_source_parts',
      sql`(${table.source} = 'scandex' and ${table.status} is null and ${table.fetchedAt} is not null) or (${table.source} = 'user' and ${table.status} is not null and ${table.igdbId} is not null)`,
    ),
    check(
      'barcode_lookups_match_parts',
      sql`${table.igdbId} is not null or (${table.platformId} is null and ${table.platformName} is null)`,
    ),
    uniqueIndex('barcode_lookups_scandex_idx')
      .on(table.code)
      .where(sql`${table.source} = 'scandex'`),
    uniqueIndex('barcode_lookups_pick_idx')
      .on(table.code, table.submittedBy)
      .where(
        sql`${table.source} = 'user' and ${table.submittedBy} is not null`,
      ),
    index('barcode_lookups_review_idx')
      .on(table.status, table.code)
      .where(sql`${table.source} = 'user'`),
    index('barcode_lookups_submitted_by_idx').on(table.submittedBy),
  ],
)
