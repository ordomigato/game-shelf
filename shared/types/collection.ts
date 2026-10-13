import type { ChartWidget } from './charts'

export type FieldType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'checkbox'
  | 'select'
  | 'multiselect'
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
  /** Allowed values, for `select` and `multiselect` fields only. */
  options?: string[]
  /** ISO 4217 code like "USD", for `currency` fields only. */
  currency?: string
  /**
   * What a `rating` (shown as "Score") is out of: 5 shows stars, 10 and 100
   * show "8/10". Missing means 5.
   */
  scale?: RatingScale
}

export type RatingScale = 5 | 10 | 100

/**
 * A value as stored: text, select and date (`YYYY-MM-DD`) are strings,
 * number, currency, rating (whole, up to its scale) and progress (0 to
 * 100) are numbers,
 * checkbox is a boolean, multiselect is a list of options in the field's
 * option order.
 */
export type FieldValue = string | number | boolean | string[]

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
  /**
   * How many of the owner's collections use this blueprint. Sent to the
   * owner only.
   */
  usedBy?: number
}

/** A shared blueprint as offered when creating a collection. */
export interface BlueprintSummary {
  id: string
  name: string
  fieldCount: number
  /** How many of the owner's collections use it. */
  usedBy: number
}

/** A collection using a blueprint, as listed on the blueprint's page. */
export interface BlueprintCollection {
  id: string
  title: string
  slug: string
  kind: CollectionKind
  itemCount: number
}

export interface BlueprintDetail extends Blueprint {
  collections: BlueprintCollection[]
}

/** What saving a blueprint's new fields would change. */
export interface BlueprintImpact {
  collections: BlueprintCollection[]
  /** Per field (by its current name), how many games would lose a value. */
  lost: { name: string; count: number }[]
}

export interface CollectionSummary {
  id: string
  title: string
  slug: string
  description: string | null
  /** A hex code like `#7c3aed`, or null for a colour from the title. */
  color: string | null
  visibility: CollectionVisibility
  kind: CollectionKind
  itemCount: number
  updatedAt: string
  /**
   * Where it's pinned in the signed-in user's sidebar, null if it isn't.
   * Only on their own list (`GET /api/collections`).
   */
  pinnedPosition?: number | null
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
  /**
   * Whether the game is also on the owner's Wishlist, in other collections.
   * Left out on the Wishlist itself, and for visitors when the Wishlist is
   * private.
   */
  wishlisted?: boolean
}

export interface CollectionDetail extends CollectionSummary {
  blueprint: Blueprint
  items: CollectionEntry[]
  /** The charts on its dashboard, in order. */
  dashboard: ChartWidget[]
  /** Whether the person viewing is the owner (and can edit). */
  isOwner: boolean
}

/** A public collection as listed on Explore. */
export interface ExploreCollection {
  id: string
  title: string
  slug: string
  kind: CollectionKind
  description: string | null
  itemCount: number
  /** When it last changed or had a game added, as an ISO timestamp. */
  activeAt: string
  owner: { username: string; displayName: string | null }
  /** Up to four of its first games, for a strip of covers. */
  preview: { name: string; coverId: string | null }[]
}

export interface ExplorePage {
  collections: ExploreCollection[]
  hasMore: boolean
}

/**
 * A game in at least one of the user's collections other than the Wishlist,
 * as listed on the Owned games page.
 */
export interface OwnedGame {
  /** The library item's id. */
  id: string
  igdbId: number | null
  name: string
  coverId: string | null
  /** When it was first added to one of those collections. */
  addedAt: string
  /** The collections it's in, by name (not the Wishlist). */
  collections: {
    id: string
    title: string
    slug: string
  }[]
}
