import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
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

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  cognitoSub: text('cognito_sub').notNull().unique(),
  displayName: text('display_name').notNull(),
  ...timestamps,
})

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    visibility: visibility('visibility').notNull().default('private'),
    fields: jsonb('fields').$type<FieldDefinition[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [index('collections_owner_id_idx').on(table.ownerId)],
)

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    /** Set when the item was pre-filled from IGDB. */
    igdbId: integer('igdb_id'),
    name: text('name').notNull(),
    coverId: text('cover_id'),
    data: jsonb('data').$type<ItemData>().notNull().default({}),
    ...timestamps,
  },
  (table) => [index('items_collection_id_idx').on(table.collectionId)],
)
