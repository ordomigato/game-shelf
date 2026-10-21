import type {
  FieldDefinition,
  FieldType,
  FieldValue,
  ItemData,
} from '../types/collection'
import {
  MAX_FIELDS,
  MAX_SELECT_OPTIONS,
  OPTION_MAX_LENGTH,
} from './field-changes'
import { normalizeFieldValue } from './field-values'

/** The most rows one import takes. */
export const MAX_IMPORT_ROWS = 5000
/** The most platforms taken from one row, and the longest name of one. */
export const MAX_ROW_PLATFORMS = 50
export const PLATFORM_NAME_MAX = 100
/** Rows sent to the server per request while importing. */
export const IMPORT_CHUNK_SIZE = 250

/** Where a CSV column's values go. */
export type ColumnTarget =
  | { kind: 'name' }
  | { kind: 'igdbId' }
  /** The platforms the game is owned on, matched on the server. */
  | { kind: 'platforms' }
  /** The platforms the game is wanted on, matched on the server. */
  | { kind: 'wishlistPlatforms' }
  | { kind: 'skip' }
  | { kind: 'field'; fieldId: string }
  | { kind: 'new'; name: string; type: FieldType }

/** A game ready to import: its values keyed by field id, empty cells left out. */
export interface ImportRow {
  name: string
  igdbId: number | null
  values: ItemData
  /** Platform names from the file, to tick as owned. The server matches them. */
  platforms?: string[]
  /** Platform names from the file, to tick as wanted on the Wishlist. */
  wishlistPlatforms?: string[]
  /** The row in the file (see `ImportProblem.row`), for platform problems. */
  row?: number
}

/**
 * A platform cell the server couldn't use, for the person to see with the
 * other problems. Found while importing, because the platforms a game can
 * be on come from the catalog.
 */
export interface PlatformProblem {
  row: number
  /** Which column it came from. */
  list: 'owned' | 'wanted'
  value: string
  reason:
    | 'unknownPlatform'
    | 'handAddedPlatforms'
    | 'notOwnedPlatforms'
    | 'wantedPlatforms'
    | 'ownedPlatforms'
}

/** A cell that couldn't be imported, for the person to see. */
export interface ImportProblem {
  /** 1-based, counting the header as row 1, like a spreadsheet. */
  row: number
  column: string
  value: string
  reason: 'noName' | 'badIgdbId' | 'doesNotFit'
}

export interface ImportPlan {
  /** The collection's fields after import: new choices and new fields added. */
  fields: FieldDefinition[]
  /** New fields, also in `fields`. */
  newFields: FieldDefinition[]
  /** New choices for existing choice lists, by field id. */
  addedOptions: Record<string, string[]>
  rows: ImportRow[]
  problems: ImportProblem[]
}

const normalize = (text: string) =>
  text
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, ' ')

const NAME_HEADERS = ['name', 'title', 'game', 'game name', 'game title']
const IGDB_HEADERS = ['igdb id', 'igdb', 'igdbid']
/** ThisPlayShelf sets the date a game joins a collection itself. */
const SKIPPED_HEADERS = ['added', 'date added', 'added at']
/**
 * The core columns of our exports, by the headers that name them. Released
 * and Genre come from IGDB, so a file's values are never used. The platform
 * columns are read.
 */
const CORE_HEADERS: Record<string, string[]> = {
  released: ['released', 'release date'],
  genre: ['genre', 'genres'],
  platforms: ['platforms', 'platform'],
  wishlistPlatforms: ['wishlist platforms', 'wishlist platform'],
}
const coreOf = (key: string) =>
  Object.keys(CORE_HEADERS).find((core) => CORE_HEADERS[core]!.includes(key))

const YES = new Set(['yes', 'y', 'true', '1', 'x', '✓', '✔'])
const NO = new Set(['no', 'n', 'false', '0'])
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/
const CURRENCY_SYMBOL = /[$€£¥₩₹]/

/** A number written by a person: "$1,234.50", "1 234", "40", "-3.5". */
function readNumber(raw: string): number | undefined {
  let text = raw.replace(CURRENCY_SYMBOL, '').replace(/\s/g, '')
  // Commas followed by exactly three digits are thousands separators.
  text = text.replace(/,(?=\d{3}(?:\D|$))/g, '')
  if (!/^-?\d*\.?\d+$/.test(text)) return undefined
  return Number(text)
}

/** Our own exports guard formula-like text with an apostrophe. Undo that. */
const unguard = (text: string) =>
  /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text

/**
 * A cell read as a field's value: null when empty, undefined when it doesn't
 * fit the field. Accepts what people tend to type, like "$40", "75%",
 * "4/5", "yes" or "x", and a list of choices split by ";" (or ",").
 */
export function parseCell(
  field: FieldDefinition,
  raw: string,
): FieldValue | null | undefined {
  const text = unguard(raw.trim())
  if (!text) return null
  let candidate: unknown
  switch (field.type) {
    case 'number':
    case 'currency':
      candidate = readNumber(text)
      break
    case 'progress':
      candidate = readNumber(text.replace(/%$/, ''))
      break
    case 'rating': {
      const [score, outOf] = text.split('/').map((part) => readNumber(part))
      if (outOf !== undefined && outOf !== (field.scale ?? 5)) return undefined
      candidate = score
      break
    }
    case 'checkbox': {
      const word = text.toLocaleLowerCase()
      candidate = YES.has(word) ? true : NO.has(word) ? false : undefined
      break
    }
    case 'date':
      candidate = ISO_DATE.exec(text)?.[1]
      break
    case 'select':
      candidate = (field.options ?? []).find(
        (option) => normalize(option) === normalize(text),
      )
      break
    case 'multiselect': {
      const parts = splitChoices(text)
      const options = field.options ?? []
      const matched = parts.map((part) =>
        options.find((option) => normalize(option) === normalize(part)),
      )
      candidate = matched.includes(undefined) ? undefined : matched
      break
    }
    default:
      candidate = text
  }
  if (candidate === undefined) return undefined
  const value = normalizeFieldValue(field, candidate)
  return value === undefined ? undefined : value
}

function splitChoices(text: string): string[] {
  const separator = text.includes(';') ? ';' : ','
  return text
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * A type for a new field, guessed from its column's values: yes/no becomes
 * a checkbox, ISO dates a date, numbers with a currency symbol an amount,
 * "75%" a percentage, other numbers a number, a few values repeated a
 * choice list (several to a cell: multiple choice), anything else text.
 */
export function guessType(values: string[]): {
  type: FieldType
  options?: string[]
} {
  const filled = values.map((value) => unguard(value.trim())).filter(Boolean)
  if (!filled.length) return { type: 'text' }
  const all = (test: (value: string) => boolean) => filled.every(test)
  if (
    all(
      (value) =>
        YES.has(value.toLocaleLowerCase()) || NO.has(value.toLocaleLowerCase()),
    ) &&
    !all((value) => /^[01]$/.test(value))
  ) {
    return { type: 'checkbox' }
  }
  if (all((value) => ISO_DATE.test(value))) return { type: 'date' }
  if (
    all(
      (value) =>
        /%$/.test(value) && readNumber(value.slice(0, -1)) !== undefined,
    )
  ) {
    return { type: 'progress' }
  }
  if (all((value) => readNumber(value) !== undefined)) {
    return {
      type: filled.some((value) => CURRENCY_SYMBOL.test(value))
        ? 'currency'
        : 'number',
    }
  }
  const multiple = filled.some((value) => value.includes(';'))
  const choices = [
    ...new Map(
      filled
        .flatMap((value) => (multiple ? splitChoices(value) : [value]))
        .map((choice) => [normalize(choice), choice]),
    ).values(),
  ]
  const repeats = choices.length <= filled.length / 2
  if (
    choices.length <= 12 &&
    (repeats || multiple) &&
    choices.every((choice) => choice.length <= OPTION_MAX_LENGTH)
  ) {
    return { type: multiple ? 'multiselect' : 'select', options: choices }
  }
  return { type: 'text' }
}

/**
 * Where each column goes, guessed from its header: the game's name, its
 * IGDB id, the platforms it's owned on, a field with the same name, or a
 * new field with a guessed type. A date-added column is skipped:
 * ThisPlayShelf sets that itself. So are the first Released and Genre
 * columns, which come from IGDB. Our own exports put these core columns
 * first, so a field of the same name later in the file still gets its values.
 */
export function autoMap(
  headers: string[],
  rows: string[][],
  fields: FieldDefinition[],
): ColumnTarget[] {
  let hasName = false
  let hasIgdb = false
  const seenCore = new Set<string>()
  const keys = headers.map(normalize)
  return headers.map((header, index): ColumnTarget => {
    const key = keys[index]!
    if (!hasName && NAME_HEADERS.includes(key)) {
      hasName = true
      return { kind: 'name' }
    }
    if (!hasIgdb && IGDB_HEADERS.includes(key)) {
      hasIgdb = true
      return { kind: 'igdbId' }
    }
    if (SKIPPED_HEADERS.includes(key)) return { kind: 'skip' }
    const core = coreOf(key)
    if (core && !seenCore.has(core)) {
      // The user's own field of that name gets a file's only such column.
      // Our exports repeat the header when a field has the same name, with
      // the core column first.
      const ownField = fields.some(
        (candidate) => normalize(candidate.name) === key,
      )
      if (!ownField || keys.filter((other) => other === key).length > 1) {
        seenCore.add(core)
        return core === 'platforms' || core === 'wishlistPlatforms'
          ? { kind: core }
          : { kind: 'skip' }
      }
    }
    const field = fields.find((candidate) => normalize(candidate.name) === key)
    if (field) return { kind: 'field', fieldId: field.id }
    if (!header.trim()) return { kind: 'skip' }
    const { type } = guessType(rows.map((row) => row[index] ?? ''))
    return { kind: 'new', name: header.trim().slice(0, 60), type }
  })
}

/**
 * Everything an import will do, worked out before anything is sent: new
 * fields (choice lists get their choices from the column), new choices for
 * existing choice lists, each game's values, and every cell that couldn't be
 * used. Rows without a name are left out. Empty cells are left out too, so
 * importing never erases a value a game already has.
 */
export function planImport(
  headers: string[],
  rows: string[][],
  targets: ColumnTarget[],
  existing: FieldDefinition[],
  newId: () => string = () => crypto.randomUUID(),
  maxFields: number = MAX_FIELDS,
): ImportPlan {
  const fields = existing.map((field) => ({
    ...field,
    ...(field.options && { options: [...field.options] }),
  }))
  const newFields: FieldDefinition[] = []
  const addedOptions: Record<string, string[]> = {}
  const columnField = new Map<number, FieldDefinition>()

  targets.forEach((target, index) => {
    if (target.kind === 'field') {
      const field = fields.find((candidate) => candidate.id === target.fieldId)
      if (field) columnField.set(index, field)
    } else if (target.kind === 'new' && fields.length < maxFields) {
      const guess = guessType(rows.map((row) => row[index] ?? ''))
      const choiceList =
        target.type === 'select' || target.type === 'multiselect'
      const field: FieldDefinition = {
        id: newId(),
        name: target.name,
        type: target.type,
        ...(choiceList && {
          options: (guess.options ?? []).slice(0, MAX_SELECT_OPTIONS),
        }),
        ...(target.type === 'currency' && { currency: 'USD' }),
        ...(target.type === 'rating' && { scale: 5 as const }),
      }
      fields.push(field)
      newFields.push(field)
      columnField.set(index, field)
    }
  })

  // Choices a choice list doesn't have yet come in as new choices.
  for (const [index, field] of columnField) {
    if (field.type !== 'select' && field.type !== 'multiselect') continue
    const options = field.options ?? (field.options = [])
    for (const row of rows) {
      const text = unguard((row[index] ?? '').trim())
      if (!text) continue
      const parts = field.type === 'multiselect' ? splitChoices(text) : [text]
      for (const part of parts) {
        const known = options.some(
          (option) => normalize(option) === normalize(part),
        )
        if (known || options.length >= MAX_SELECT_OPTIONS) continue
        if (part.length > OPTION_MAX_LENGTH) continue
        options.push(part)
        if (!newFields.includes(field)) {
          ;(addedOptions[field.id] ??= []).push(part)
        }
      }
    }
  }

  const nameColumn = targets.findIndex((target) => target.kind === 'name')
  const igdbColumn = targets.findIndex((target) => target.kind === 'igdbId')
  const platformsColumn = targets.findIndex(
    (target) => target.kind === 'platforms',
  )
  const wishlistColumn = targets.findIndex(
    (target) => target.kind === 'wishlistPlatforms',
  )
  const platformNames = (column: number, row: string[]) =>
    column >= 0
      ? splitChoices(unguard((row[column] ?? '').trim()))
          .slice(0, MAX_ROW_PLATFORMS)
          .map((platform) => platform.slice(0, PLATFORM_NAME_MAX))
      : []
  const problems: ImportProblem[] = []
  const planned: ImportRow[] = []
  rows.slice(0, MAX_IMPORT_ROWS).forEach((row, rowIndex) => {
    const spreadsheetRow = rowIndex + 2
    const name = unguard((row[nameColumn] ?? '').trim()).slice(0, 200)
    if (!name) {
      if (row.some((cell) => cell.trim())) {
        problems.push({
          row: spreadsheetRow,
          column: headers[nameColumn] ?? '',
          value: '',
          reason: 'noName',
        })
      }
      return
    }
    let igdbId: number | null = null
    const rawId = (row[igdbColumn] ?? '').trim()
    if (igdbColumn >= 0 && rawId) {
      if (/^\d+$/.test(rawId) && Number(rawId) > 0) igdbId = Number(rawId)
      else {
        problems.push({
          row: spreadsheetRow,
          column: headers[igdbColumn]!,
          value: rawId,
          reason: 'badIgdbId',
        })
      }
    }
    const values: ItemData = {}
    for (const [index, field] of columnField) {
      const raw = row[index] ?? ''
      const value = parseCell(field, raw)
      if (value === undefined) {
        problems.push({
          row: spreadsheetRow,
          column: headers[index]!,
          value: raw.trim(),
          reason: 'doesNotFit',
        })
      } else if (value !== null) {
        values[field.id] = value
      }
    }
    const platforms = platformNames(platformsColumn, row)
    const wishlistPlatforms = platformNames(wishlistColumn, row)
    planned.push({
      name,
      igdbId,
      values,
      ...(platforms.length && { platforms }),
      ...(wishlistPlatforms.length && { wishlistPlatforms }),
      ...((platforms.length || wishlistPlatforms.length) && {
        row: spreadsheetRow,
      }),
    })
  })

  return { fields, newFields, addedOptions, rows: planned, problems }
}
