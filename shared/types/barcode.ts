/** A game a barcode stands for, with where the user has it already. */
export interface BarcodeMatch {
  igdbId: number
  name: string
  coverId: string | null
  releaseDate: string | null
  /** The version on the box. Null when ScanDex doesn't say. */
  platform: { id: number; name: string } | null
  owned: boolean
  wishlisted: boolean
  ownedOn: number[]
  wantedOn: number[]
}

/** The answer to a barcode lookup. `match` is null when no game has it. */
export interface BarcodeResult {
  match: BarcodeMatch | null
  /** True when the user matched this barcode themselves, which beats ScanDex. */
  own?: boolean
}

/** One game to add in bulk. */
export interface BulkAddEntry {
  igdbId: number
  platformId: number | null
  /** With `own`, the barcode the user matched to this game themselves. */
  barcode?: string
  /** The user picked this game for `barcode` (Find it or Change). */
  own?: boolean
}

/** Why a game in a bulk add was left alone. */
export type BulkSkipReason =
  /** Already on that list, on that platform. */
  | 'already'
  /** A Wishlist add for a platform the game is owned on. */
  | 'ownedHere'
  /** IGDB has no such game. */
  | 'notFound'

export interface BulkAddResult {
  /** Games put on the list (or moved to it from the other). */
  added: number
  /** Of those, games added with no platform because theirs wasn't one of the game's. */
  withoutPlatform: number
  skipped: { igdbId: number; reason: BulkSkipReason }[]
  /** Games newly put in the collection, when one was asked for. */
  inCollection: number
}
