/** The signed-in user, as returned by `/api/me`. */
export interface Me {
  id: string
  /** Null until chosen on the welcome screen. */
  username: string | null
  displayName: string | null
  createdAt: string
}

/** What anyone can see about a user, on their shelf. */
export interface PublicProfile {
  username: string
  displayName: string | null
  /** When they joined, as an ISO timestamp. */
  memberSince: string
}
