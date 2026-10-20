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
 * One extra field a user keeps for their games. `id` is stable and is the key used
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
  /**
   * Kept from everyone but the owner: visitors never get this field, its
   * values, or charts that use it. Missing means shown.
   */
  hidden?: true
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

/** An item's values, keyed by `FieldDefinition.id`. */
export type ItemData = Record<string, FieldValue>

export type CollectionVisibility = 'private' | 'public'

/**
 * The two lists every user has. They aren't collections: each is a filter
 * on the user's games (`owned`, `wishlisted`), so a game is never in both
 * at once, except as different versions (see `shared/utils/lists.ts`).
 */
export type ListName = 'owned' | 'wishlist'

/** What saving new account fields would change. */
export interface FieldsImpact {
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
  /** For an IGDB game, the catalog's name once it has one. */
  name: string
  coverId: string | null
  /** The IGDB game's first release year. Null when unknown. */
  year: number | null
  /** The IGDB game's genres. Empty when unknown or added by hand. */
  genres: string[]
  data: ItemData
  /** Which of the two lists the game is on. At least one is true. */
  owned: boolean
  wishlisted: boolean
  /** Catalog platform ids the game is owned on. Empty when none named. */
  ownedOn: number[]
  /** Catalog platform ids the game is wanted on. Empty when none named. */
  wantedOn: number[]
}

/**
 * A game in a collection. Its place on the lists is the owner's business:
 * visitors get only `wanted` (for a badge), and the flags and platforms
 * are left out.
 */
export interface CollectionEntry extends Omit<
  LibraryItem,
  'owned' | 'wishlisted' | 'ownedOn' | 'wantedOn'
> {
  addedAt: string
  /** Whether the game is on the owner's Wishlist. */
  wanted: boolean
  owned?: boolean
  wishlisted?: boolean
  ownedOn?: number[]
  wantedOn?: number[]
  /** On Owned and the Wishlist: the custom collections the game is in. */
  inCollections?: CollectionLink[]
  /** On Owned and the Wishlist: short names of the platforms for that list. */
  platforms?: string[]
}

/**
 * One page of Owned or the Wishlist, as its owner sees it. The server sorts,
 * searches and filters, so `items` holds only the rows of this page.
 */
export interface ListDetail {
  list: ListName
  /** Every game on the list, whatever the search and filters. */
  itemCount: number
  /** Every game in the library, which the account's games limit counts. */
  libraryCount: number
  /** The games matching the search and filters. */
  total: number
  /** The page these items are, from 1. The server keeps it in range. */
  page: number
  size: number
  /** All the owner's fields, hidden ones included. */
  fields: FieldDefinition[]
  /** The platforms some game on this list is on, for the filter. */
  platforms: { id: number; name: string }[]
  /** Keys of the columns the owner hides on this list. */
  hiddenColumns: string[]
  items: OwnerEntry[]
}

/** A game as its owner sees it: with its place on the lists. */
export type OwnerEntry = CollectionEntry &
  Required<
    Pick<CollectionEntry, 'owned' | 'wishlisted' | 'ownedOn' | 'wantedOn'>
  >

/** A collection named next to a game, linking to it. */
export interface CollectionLink {
  id: string
  title: string
  slug: string
  /** A hex code like `#7c3aed`, or null for a colour from the title. */
  color: string | null
}

export interface CollectionDetail extends CollectionSummary {
  /** The owner's fields, the columns of every collection. */
  fields: FieldDefinition[]
  items: CollectionEntry[]
  /** The charts on its dashboard, in order. */
  dashboard: ChartWidget[]
  /** Keys of the columns the owner hides in the table (shared/utils/columns.ts). */
  hiddenColumns: string[]
  /** Whether the person viewing is the owner (and can edit). */
  isOwner: boolean
}

/** A public collection as listed on Explore. */
export interface ExploreCollection {
  id: string
  title: string
  slug: string
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
