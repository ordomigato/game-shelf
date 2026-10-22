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
  /** Barcodes the user matched to this same game, merged into this row. */
  extraCodes?: string[]
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

/** The barcodes the user matched to a row's game themselves. */
function ownCodes(row: ScanRow): string[] {
  return [...(row.own ? [row.code] : []), ...(row.extraCodes ?? [])]
}

/**
 * What one bulk request sends: the games `entriesToAdd` adds, each carrying
 * one barcode the user matched to it, and a `rememberOnly` entry for every
 * other barcode of theirs. Those are never added. The server saves them
 * only if the game is in the library. A row unticked on purpose is left
 * out, but one that can't be ticked because the game is already on the
 * list still has its barcodes saved as picks. A ScanDex match sends none.
 */
export function batchEntries(rows: ScanRow[], list: ListName): BulkAddEntry[] {
  const adds = new Map<string, BulkAddEntry>()
  const remembered: BulkAddEntry[] = []
  for (const row of rows) {
    if (!row.match) continue
    const igdbId = row.match.igdbId
    const platformId = row.match.platform?.id ?? null
    let codes = ownCodes(row)
    if (row.ticked && canTick(row, list)) {
      const key = `${igdbId}:${platformId ?? ''}`
      let entry = adds.get(key)
      if (!entry) {
        entry = { igdbId, platformId }
        adds.set(key, entry)
      }
      if (codes.length && !entry.own) {
        entry.barcode = codes[0]
        entry.own = true
        codes = codes.slice(1)
      }
    } else if (rowHold(row.match, list) === 'ready') {
      codes = []
    }
    for (const barcode of codes) {
      remembered.push({
        igdbId,
        platformId,
        barcode,
        own: true,
        rememberOnly: true,
      })
    }
  }
  return [...adds.values(), ...remembered]
}

/**
 * Sets a row to a game the user chose. If another row already holds the same
 * game and platform the two merge: this row goes, its barcode moves to the other
 * row (`extraCodes`), and the other is named in `merged`.
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
    // The barcode isn't lost: the twin keeps it for the user.
    const gone = rows.find((row) => row.code === code)
    const carried = [
      ...(twin.extraCodes ?? []),
      code,
      ...(gone?.extraCodes ?? []),
    ]
    return {
      rows: rows
        .filter((row) => row.code !== code)
        .map((row) =>
          row === twin
            ? {
                ...row,
                extraCodes: [...new Set(carried)].filter((c) => c !== row.code),
              }
            : row,
        ),
      merged: twin.code,
    }
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

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((s) => typeof s === 'string')

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
          ...(isStrings(row.extraCodes) &&
            row.extraCodes.length > 0 && { extraCodes: row.extraCodes }),
        },
      ]
    }
    return []
  })
}
