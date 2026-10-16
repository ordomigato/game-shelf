import type { ListName } from '../types/collection'

/**
 * Where a game stands on the user's two lists. The database enforces the
 * same rules with check constraints on `library_items`:
 *
 * - a platform is never both owned and wanted,
 * - a platform in `ownedOn` needs `owned`, one in `wantedOn` needs
 *   `wishlisted`,
 * - a game is on both lists only when it's wanted on named platforms (a
 *   different version from the one owned),
 * - a game is on at least one list.
 */
export interface ListState {
  owned: boolean
  wishlisted: boolean
  ownedOn: number[]
  wantedOn: number[]
}

/** What a person can do to a game's place on the lists. */
export type ListAction =
  /** Got it: owned now, with the wanted platforms moved to owned. */
  | { type: 'gotIt' }
  /** Move to the Wishlist: the owned platforms become wanted. */
  | { type: 'toWishlist' }
  /** Tick Owned. Like Got it when the game was only wanted. */
  | { type: 'own' }
  /** Tick the Wishlist. Like Move to Wishlist when the game was owned. */
  | { type: 'want' }
  /** The platforms the game is owned on, replacing the old ones. */
  | { type: 'setOwnedOn'; platforms: number[] }
  /** The platforms the game is wanted on, replacing the old ones. */
  | { type: 'setWantedOn'; platforms: number[] }
  /** Take the game off Owned only. */
  | { type: 'unown' }
  /** Take the game off the Wishlist only. */
  | { type: 'unwant' }

const unique = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b)
const without = (ids: number[], remove: number[]) =>
  ids.filter((id) => !remove.includes(id))

/** The state of a game just added to one list, on these platforms. */
export function newListState(list: ListName, platforms: number[]): ListState {
  const named = unique(platforms)
  return list === 'owned'
    ? { owned: true, wishlisted: false, ownedOn: named, wantedOn: [] }
    : { owned: false, wishlisted: true, ownedOn: [], wantedOn: named }
}

/** Whether a state follows all of the database's rules. */
export function listStateValid(state: ListState): boolean {
  const apart = !state.ownedOn.some((id) => state.wantedOn.includes(id))
  return (
    apart &&
    (state.ownedOn.length === 0 || state.owned) &&
    (state.wantedOn.length === 0 || state.wishlisted) &&
    (!(state.owned && state.wishlisted) || state.wantedOn.length > 0) &&
    (state.owned || state.wishlisted)
  )
}

/**
 * The state after an action, or null when the game ends up on neither
 * list (the caller deletes it). A valid state always gives a valid state.
 */
export function applyListAction(
  state: ListState,
  action: ListAction,
): ListState | null {
  switch (action.type) {
    case 'gotIt':
      return {
        owned: true,
        wishlisted: false,
        ownedOn: unique([...state.ownedOn, ...state.wantedOn]),
        wantedOn: [],
      }
    case 'toWishlist':
      return {
        owned: false,
        wishlisted: true,
        ownedOn: [],
        wantedOn: unique([...state.wantedOn, ...state.ownedOn]),
      }
    case 'own':
      return state.owned ? state : applyListAction(state, { type: 'gotIt' })
    case 'want':
      return state.wishlisted
        ? state
        : applyListAction(state, { type: 'toWishlist' })
    case 'setOwnedOn': {
      const ownedOn = unique(action.platforms)
      const wantedOn = without(state.wantedOn, ownedOn)
      const owned = state.owned || ownedOn.length > 0
      return {
        owned,
        // Owned, with a wish that names no platform, is just owned.
        wishlisted: state.wishlisted && (!owned || wantedOn.length > 0),
        ownedOn,
        wantedOn,
      }
    }
    case 'setWantedOn': {
      const wantedOn = unique(action.platforms)
      const ownedOn = without(state.ownedOn, wantedOn)
      const wishlisted = state.wishlisted || wantedOn.length > 0
      return {
        owned: state.owned,
        wishlisted: wishlisted && (!state.owned || wantedOn.length > 0),
        ownedOn,
        wantedOn,
      }
    }
    case 'unown':
      return state.wishlisted ? { ...state, owned: false, ownedOn: [] } : null
    case 'unwant':
      return state.owned ? { ...state, wishlisted: false, wantedOn: [] } : null
  }
}
