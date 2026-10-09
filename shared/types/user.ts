/** The signed-in user, as returned by `/api/me`. */
export interface Me {
  id: string
  /** Null until chosen on the welcome screen. */
  username: string | null
  displayName: string | null
  createdAt: string
}
