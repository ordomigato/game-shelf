import type { BarcodeMatch, BulkAddEntry } from '#shared/types/barcode'
import type { ListName } from '#shared/types/collection'

/** One scanned barcode in the scanner's list. */
export interface ScanRow {
  /** The normalised barcode, which is also the row's identity. */
  code: string
  status: 'loading' | 'match' | 'none' | 'error'
  /** Why a lookup failed: the caps were reached, or something broke. */
  problem?: 'limit' | 'failed'
  match?: BarcodeMatch
  ticked: boolean
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
  const seen = new Set<string>()
  const entries: BulkAddEntry[] = []
  for (const row of rows) {
    if (!row.ticked || !row.match || !canTick(row, list)) continue
    const entry = {
      igdbId: row.match.igdbId,
      platformId: row.match.platform?.id ?? null,
    }
    const key = `${entry.igdbId}:${entry.platformId ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
  }
  return entries
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
        },
      ]
    }
    return []
  })
}
