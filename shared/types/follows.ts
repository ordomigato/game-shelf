/** How the signed-in viewer stands with one account. */
export interface Relationship {
  /** The viewer follows them. */
  following: boolean
  /** They follow the viewer. */
  followedBy: boolean
  /** The viewer has blocked them. */
  blocking: boolean
}

/** What an account's follow counts show to a viewer. */
export interface FollowCounts {
  following: number
  followers: number
}

/** One account on a Following or Followers list. */
export interface FollowRow {
  username: string
  displayName: string | null
  /** The viewer follows this account. */
  following: boolean
  /** This account follows the viewer. */
  followsYou: boolean
  /** The viewer and this account follow each other. */
  mutual: boolean
  /** This row is the viewer. */
  isYou: boolean
}

/** A page of a Following or Followers list, newest first. */
export interface FollowPage {
  items: FollowRow[]
  /** Pass as `cursor` for the next page. Null on the last one. */
  next: string | null
}

/** One recent change by an account the viewer follows. */
export interface FollowUpdate {
  username: string
  displayName: string | null
  /** A custom collection, or the account's Owned or Wishlist. */
  kind: 'collection' | 'owned' | 'wishlist'
  /** The collection's title and address. Null for Owned and the Wishlist. */
  title: string | null
  slug: string | null
  updatedAt: string
}

/** The home page's "From accounts you follow". */
export interface FollowUpdates {
  /** False when the viewer follows nobody, so the section stays hidden. */
  followsAnyone: boolean
  items: FollowUpdate[]
}

/** An account the viewer has blocked, for Settings. */
export interface BlockedAccount {
  username: string
  displayName: string | null
  since: string
}
