import type { FieldDefinition, FieldValue, ItemData } from '../types/collection'
import type { Message } from '../types/message'

/** The columns every export starts with, before the collection's fields. */
export const FIXED_COLUMNS: [Message, Message, Message] = [
  { key: 'export.columns.name' },
  { key: 'export.columns.igdbId' },
  { key: 'export.columns.added' },
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

/** A game as an export needs it. */
export interface ExportItem {
  name: string
  igdbId: number | null
  /** ISO timestamp. */
  addedAt: string
  data: ItemData
}

/**
 * A collection as CSV: a row per game, in the order given, with its name,
 * IGDB id and date added, then a column per field. `columns` are the first
 * three column names, already in the reader's language. Used in the
 * browser for one collection and on the server for "Export all".
 */
export function collectionCsv(
  fields: FieldDefinition[],
  items: ExportItem[],
  columns: [name: string, igdbId: string, added: string],
): string {
  const header = [...columns, ...fields.map((field) => safeText(field.name))]
  const rows = items.map((item) => [
    safeText(item.name),
    item.igdbId === null ? '' : String(item.igdbId),
    item.addedAt.slice(0, 10),
    ...fields.map((field) => exportValue(field, item.data[field.id])),
  ])
  return toCsv([header, ...rows])
}
