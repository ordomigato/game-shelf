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
  /** Only remember `barcode` for the user. Never adds the game. */
  rememberOnly?: boolean
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

export type BarcodeReviewStatus = 'pending' | 'approved' | 'rejected'

/**
 * The people who matched one barcode to one game and platform, as the barcode
 * reviewer sees them. The reviewer's view only: it carries usernames.
 */
export interface BarcodeReviewGroup {
  /** Identifies the group in the list. */
  key: string
  code: string
  igdbId: number
  /** Null when the picker gave no platform. Such a group can't be sent. */
  platformId: number | null
  /** The game's name in our catalog. */
  name: string
  coverId: string | null
  /** The platform's name in our catalog. */
  platform: string | null
  status: BarcodeReviewStatus
  /** How many people picked it. */
  people: number
  /** Their usernames, oldest pick first. */
  users: string[]
  /** When the latest pick was made. */
  pickedAt: string
  /** Approved groups only: whether it was sent to ScanDex. */
  sent: boolean
  /** What ScanDex says about this barcode now. Null when we never asked. */
  scandex: { igdbId: number; name: string | null } | 'none' | null
  /** ScanDex has a different game for the barcode. */
  disagrees: boolean
  /** Pending groups only: another game is already approved for the barcode. */
  conflict: { name: string } | null
}

export type BarcodeReviewAction =
  'approve' | 'approveAndSend' | 'reject' | 'send'

/** Which group an action is for. */
export interface BarcodeReviewTarget {
  code: string
  igdbId: number
  platformId: number | null
}

/**
 * How an action went for one group. `result` is about the approving or
 * rejecting (`conflict`: another game is approved for the barcode, `gone`:
 * nothing to act on any more). `send` is set when the action sent the group
 * to ScanDex: `status` is ScanDex's HTTP status, or 0 when it wasn't reached,
 * and `message` is ScanDex's own error text, trimmed to about 200 characters.
 */
export type BarcodeReviewOutcome = BarcodeReviewTarget & {
  result: 'done' | 'conflict' | 'gone'
  send?:
    | { result: 'sent' }
    | { result: 'failed'; status: number; message: string | null }
}
