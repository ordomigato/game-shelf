export type FieldType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'checkbox'
  | 'select'
  | 'rating'
  | 'progress'

/**
 * One user-defined column in a blueprint. `id` is stable and is the key used
 * in each item's `data`, so a field can be renamed without touching items.
 */
export interface FieldDefinition {
  id: string
  name: string
  type: FieldType
  /** Allowed values, for `select` fields only. */
  options?: string[]
  /** ISO 4217 code like "USD", for `currency` fields only. */
  currency?: string
}

/**
 * A value as stored: text, select and date (`YYYY-MM-DD`) are strings,
 * number, currency, rating (1 to 5) and progress (0 to 100) are numbers,
 * checkbox is a boolean.
 */
export type FieldValue = string | number | boolean

/** An item's values, keyed by `FieldDefinition.id`, across all blueprints. */
export type ItemData = Record<string, FieldValue>

export type CollectionVisibility = 'private' | 'public'

/** `wishlist` is the one Wishlist every user has. Everything else is `custom`. */
export type CollectionKind = 'custom' | 'wishlist'

export interface Blueprint {
  id: string
  /** Null for a private blueprint, which belongs to one collection. */
  name: string | null
  shared: boolean
  fields: FieldDefinition[]
}

export interface CollectionSummary {
  id: string
  title: string
  slug: string
  description: string | null
  visibility: CollectionVisibility
  kind: CollectionKind
  itemCount: number
  updatedAt: string
}

export interface LibraryItem {
  id: string
  igdbId: number | null
  name: string
  coverId: string | null
  data: ItemData
}

export interface CollectionEntry extends LibraryItem {
  addedAt: string
}

export interface CollectionDetail extends CollectionSummary {
  blueprint: Blueprint
  items: CollectionEntry[]
  /** Whether the person viewing is the owner (and can edit). */
  isOwner: boolean
}
