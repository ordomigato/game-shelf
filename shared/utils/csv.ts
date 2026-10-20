import type {
  CollectionEntry,
  FieldDefinition,
  FieldValue,
} from '../types/collection'
import type { Message } from '../types/message'
import { platformsOf } from './platforms'
import type { ReleasePrecision } from './release-date'

/**
 * The columns every export starts with, before the collection's fields. The
 * last three are the core columns: IGDB's release date, genres, and the
 * platforms the game is owned on.
 */
export const FIXED_COLUMNS: Message[] = [
  { key: 'export.columns.name' },
  { key: 'export.columns.igdbId' },
  { key: 'export.columns.added' },
  { key: 'export.columns.released' },
  { key: 'export.columns.genre' },
  { key: 'export.columns.platforms' },
]

/** Joins a multiple-choice value in a cell. Choices can contain commas. */
export const CHOICE_SEPARATOR = '; '

// A byte-order mark, so Excel opens the file as UTF-8 (accents, "é", "★").
const BOM = '\uFEFF'

/**
 * A cell that a spreadsheet won't run as a formula. Text starting with
 * =, +, - or @ (or a tab or carriage return) could be a formula, so it gets
 * a leading apostrophe, which spreadsheets hide. Only for text people wrote:
 * numbers are written plainly, so -5 stays -5.
 */
export function safeText(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
}

/** Rows as CSV text (RFC 4180, CRLF line ends), ready to save. */
export function toCsv(rows: string[][]): string {
  return BOM + rows.map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n'
}

/**
 * A stored value as a cell: numbers plainly (amounts to two decimals),
 * dates as YYYY-MM-DD, checkboxes as Yes or No, choices joined with "; ".
 * Empty for no value.
 */
export function exportValue(
  field: FieldDefinition,
  value: FieldValue | undefined,
): string {
  if (value === undefined) return ''
  switch (field.type) {
    case 'checkbox':
      return value === true ? 'Yes' : 'No'
    case 'currency':
      return Number(value).toFixed(2)
    case 'number':
    case 'rating':
    case 'progress':
      return String(value)
    case 'multiselect':
      return safeText(
        (Array.isArray(value) ? value : [String(value)]).join(CHOICE_SEPARATOR),
      )
    default:
      return safeText(String(value))
  }
}

/**
 * A game as an export needs it. The catalog's facts and the platforms are
 * missing for a game added by hand, and a visitor gets no platforms.
 */
export interface ExportItem extends Pick<CollectionEntry, 'name' | 'data'> {
  igdbId: number | null
  /** ISO timestamp. */
  addedAt: string
  releaseDate?: string | null
  releasePrecision?: ReleasePrecision | null
  genres?: string[]
  ownedOn?: number[]
  catalogPlatforms?: CollectionEntry['catalogPlatforms']
}

/**
 * A release date for a machine, at the precision IGDB knows: `2017`,
 * `2017-03`, `2017-03-03`, `2017-Q1` for a quarter or `TBD`. Empty when
 * there is no date. Never shifted by a time zone: dates are UTC days.
 */
export function releasedText(
  date: string | null | undefined,
  precision: ReleasePrecision | null | undefined,
): string {
  if (precision === 'tbd') return 'TBD'
  const day = date?.slice(0, 10)
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  switch (precision) {
    case 'year':
      return day.slice(0, 4)
    case 'month':
      return day.slice(0, 7)
    case 'quarter':
      return `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`
    default:
      return day
  }
}

/** The platforms a game is owned on, by their short names. */
export const ownedPlatformNames = (item: ExportItem) =>
  platformsOf({
    catalogPlatforms: item.catalogPlatforms,
    ownedOn: item.ownedOn,
    wantedOn: [],
  }).owned.map(({ name }) => name)

/**
 * A collection as CSV: a row per game, in the order given, with its name,
 * IGDB id, date added, release date, genres and owned platforms, then a
 * column per field. `columns` are the first six column names, already in
 * the reader's language. Used in the browser for one collection and on the
 * server for "Export all" and the lists.
 */
export function collectionCsv(
  fields: FieldDefinition[],
  items: ExportItem[],
  columns: string[],
): string {
  const header = [...columns, ...fields.map((field) => safeText(field.name))]
  const rows = items.map((item) => [
    safeText(item.name),
    item.igdbId === null ? '' : String(item.igdbId),
    item.addedAt.slice(0, 10),
    releasedText(item.releaseDate, item.releasePrecision),
    safeText((item.genres ?? []).join(CHOICE_SEPARATOR)),
    safeText(ownedPlatformNames(item).join(CHOICE_SEPARATOR)),
    ...fields.map((field) => exportValue(field, item.data[field.id])),
  ])
  return toCsv([header, ...rows])
}
