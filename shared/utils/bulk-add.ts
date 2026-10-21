import type { ListName } from '../types/collection'
import type { BulkAddEntry, BulkSkipReason } from '../types/barcode'
import {
  applyListAction,
  listStateValid,
  newListState,
  type ListState,
} from './lists'

/** The messages for a bulk add the plan's limits can't take whole. */
export const BULK_NO_ROOM = {
  library: { key: 'limits.reached.bulkLibrary' },
  collection: { key: 'limits.reached.bulkCollection' },
} as const

/** What the plan needs to know about a game from the catalog. */
export interface PlanGame {
  /** The IGDB platforms the game came out on. */
  platformIds: number[]
}

export interface BulkPlan {
  /** Games to write, with the state each ends up in. */
  writes: { igdbId: number; state: ListState; isNew: boolean }[]
  /** Games that end up in the library, so they can join a collection. */
  present: number[]
  added: number
  skipped: { igdbId: number; reason: BulkSkipReason }[]
}

/** The entries with each game and platform once, in the order given. */
export function dedupeEntries(entries: BulkAddEntry[]): BulkAddEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = `${entry.igdbId}:${entry.platformId ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Works out what adding these games to a list does, with the same rules as
 * one game at a time (Got it, tick a platform): Owned adds the platform to
 * "owned on" and moves it over from "wanted on", the Wishlist adds it to
 * "wanted on" and leaves a game that is owned on that platform alone (a
 * platform is never on both lists). Nothing here reads or writes the
 * database. `existing` is the user's state for games they already have and
 * `catalog` the games IGDB knows, so an unknown game is skipped.
 */
export function planBulkAdd(
  list: ListName,
  entries: BulkAddEntry[],
  existing: Map<number, ListState>,
  catalog: Map<number, PlanGame>,
): BulkPlan {
  const states = new Map<number, ListState>()
  const changed = new Set<number>()
  const present = new Set<number>()
  const skipped: BulkPlan['skipped'] = []
  const addedGames = new Set<number>()

  for (const { igdbId, platformId } of dedupeEntries(entries)) {
    const game = catalog.get(igdbId)
    if (!game) {
      skipped.push({ igdbId, reason: 'notFound' })
      continue
    }
    if (platformId !== null && !game.platformIds.includes(platformId)) {
      skipped.push({ igdbId, reason: 'platform' })
      continue
    }
    present.add(igdbId)
    const before = states.get(igdbId) ?? existing.get(igdbId)
    const platforms = platformId === null ? [] : [platformId]
    if (!before) {
      states.set(igdbId, newListState(list, platforms))
      changed.add(igdbId)
      addedGames.add(igdbId)
      continue
    }
    const onList = list === 'owned' ? before.owned : before.wishlisted
    const here = list === 'owned' ? before.ownedOn : before.wantedOn
    const other = list === 'owned' ? before.wantedOn : before.ownedOn
    if (platformId === null) {
      // Without a platform, a game on the other list can't also join this
      // one, since being on both needs a wishlist platform.
      if (onList) skipped.push({ igdbId, reason: 'already' })
      else if (list === 'wishlist')
        skipped.push({ igdbId, reason: 'ownedHere' })
      else {
        states.set(igdbId, applyListAction(before, { type: 'own' })!)
        changed.add(igdbId)
        addedGames.add(igdbId)
      }
      continue
    }
    if (here.includes(platformId)) {
      skipped.push({ igdbId, reason: 'already' })
      continue
    }
    if (list === 'wishlist' && other.includes(platformId)) {
      skipped.push({ igdbId, reason: 'ownedHere' })
      continue
    }
    const next = applyListAction(before, {
      type: list === 'owned' ? 'setOwnedOn' : 'setWantedOn',
      platforms: [...here, platformId],
    })!
    states.set(igdbId, next)
    changed.add(igdbId)
    addedGames.add(igdbId)
  }

  const writes = [...changed].map((igdbId) => {
    const state = states.get(igdbId)!
    if (!listStateValid(state)) {
      throw new Error('Bulk add produced a state the database refuses')
    }
    return { igdbId, state, isNew: !existing.has(igdbId) }
  })
  return { writes, present: [...present], added: addedGames.size, skipped }
}
