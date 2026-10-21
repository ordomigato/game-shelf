import type { BarcodeMatch, BulkAddEntry } from '#shared/types/barcode'
import type { ListName } from '#shared/types/collection'

/** One scanned barcode in the scanner's list. */
export interface ScanRow {
  /** The normalised barcode, which is also the row's identity. */
  code: string
  /** The digits to look up, as scanned. Not kept in session storage. */
  query?: string
  status: 'loading' | 'match' | 'none' | 'error'
  /** Why a lookup failed: the caps were reached, or something broke. */
  problem?: 'limit' | 'failed'
  match?: BarcodeMatch
  ticked: boolean
  /** The user matched this barcode themselves (Find it, Change, or an earlier pick). */
  own?: boolean
}

/** Where a matched game stands on the chosen list, on the box's platform. */
export type RowHold = 'ready' | 'ownedHere' | 'wishlistedHere'

export function rowHold(match: BarcodeMatch, list: ListName): RowHold {
  const platform = match.platform?.id ?? null
  const ownedHere =
    platform === null ? match.owned : match.ownedOn.includes(platform)
  if (ownedHere) return 'ownedHere'
  const wantedHere =
    platform === null ? match.wishlisted : match.wantedOn.includes(platform)
  return list === 'wishlist' && wantedHere ? 'wishlistedHere' : 'ready'
}

/**
 * Whether a row can be ticked for this list. A game already owned on the
 * platform can still be ticked for Owned (it may join a collection), but not
 * for the Wishlist.
 */
export function canTick(row: ScanRow, list: ListName): boolean {
  if (row.status !== 'match' || !row.match) return false
  const hold = rowHold(row.match, list)
  return hold === 'ready' || (hold === 'ownedHere' && list === 'owned')
}

/** A new row starts ticked unless the game is already on the list. */
export function defaultTicked(match: BarcodeMatch, list: ListName): boolean {
  return rowHold(match, list) === 'ready'
}

/** The games the ticked rows add, each game and platform once. */
export function entriesToAdd(rows: ScanRow[], list: ListName): BulkAddEntry[] {
  const seen = new Map<string, BulkAddEntry>()
  const entries: BulkAddEntry[] = []
  for (const row of rows) {
    if (!row.ticked || !row.match || !canTick(row, list)) continue
    const entry: BulkAddEntry = {
      igdbId: row.match.igdbId,
      platformId: row.match.platform?.id ?? null,
    }
    // Only the user's own matches carry their barcode, so the server can
    // remember them for this user. A ScanDex match never does.
    if (row.own) {
      entry.barcode = row.code
      entry.own = true
    }
    const key = `${entry.igdbId}:${entry.platformId ?? ''}`
    const first = seen.get(key)
    if (first) {
      // The same game twice adds once, and a barcode the user matched is
      // still remembered.
      if (entry.own && !first.own) Object.assign(first, entry)
      continue
    }
    seen.set(key, entry)
    entries.push(entry)
  }
  return entries
}

/**
 * Sets a row to a game the user chose. If another row already holds the same
 * game and platform the two merge: this row goes and the other is named in
 * `merged`.
 */
export function pickGame(
  rows: ScanRow[],
  code: string,
  match: BarcodeMatch,
  list: ListName,
): { rows: ScanRow[]; merged: string | null } {
  const platform = match.platform?.id ?? null
  const twin = rows.find(
    (row) =>
      row.code !== code &&
      row.match?.igdbId === match.igdbId &&
      (row.match.platform?.id ?? null) === platform,
  )
  if (twin) {
    return { rows: rows.filter((row) => row.code !== code), merged: twin.code }
  }
  return {
    rows: rows.map((row) =>
      row.code === code
        ? {
            code,
            status: 'match',
            match,
            ticked: defaultTicked(match, list),
            own: true,
          }
        : row,
    ),
    merged: null,
  }
}

const isNumbers = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((n) => typeof n === 'number')

function isMatch(value: unknown): value is BarcodeMatch {
  if (typeof value !== 'object' || value === null) return false
  const match = value as Record<string, unknown>
  return (
    typeof match.igdbId === 'number' &&
    typeof match.name === 'string' &&
    typeof match.owned === 'boolean' &&
    typeof match.wishlisted === 'boolean' &&
    isNumbers(match.ownedOn) &&
    isNumbers(match.wantedOn)
  )
}

/**
 * The rows kept in the browser's session storage, checked as they come
 * back. A row that was still being looked up when the page closed is
 * dropped, since nothing is waiting for its answer.
 */
export function parseStoredRows(raw: unknown): ScanRow[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry: unknown): ScanRow[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const row = entry as Record<string, unknown>
    if (typeof row.code !== 'string') return []
    if (row.status === 'none') {
      return [{ code: row.code, status: 'none', ticked: false }]
    }
    if (row.status === 'match' && isMatch(row.match)) {
      return [
        {
          code: row.code,
          status: 'match',
          match: row.match,
          ticked: row.ticked === true,
          ...(row.own === true && { own: true }),
        },
      ]
    }
    return []
  })
}
