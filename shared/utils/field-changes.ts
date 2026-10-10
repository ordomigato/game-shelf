import type {
  FieldDefinition,
  FieldType,
  FieldValue,
  ItemData,
  RatingScale,
} from '../types/collection'
import { normalizeFieldValue } from './field-values'

export const FIELD_TYPES: FieldType[] = [
  'text',
  'number',
  'currency',
  'date',
  'checkbox',
  'select',
  'multiselect',
  'rating',
  'progress',
]
export const MAX_FIELDS = 30
export const FIELD_NAME_MAX_LENGTH = 60
export const MAX_SELECT_OPTIONS = 50
export const OPTION_MAX_LENGTH = 60
export const DEFAULT_CURRENCY = 'USD'
export const RATING_SCALES: RatingScale[] = [5, 10, 100]

/** Select option renames, per field id: old option to new option. */
export type OptionRenames = Record<string, Record<string, string>>

/**
 * Why a list of fields can't be saved, as an i18n key with values, or null
 * when it's fine. Checked in the browser for messages and on the server.
 */
export function fieldsProblem(
  fields: FieldDefinition[],
): { key: string; params?: Record<string, string | number> } | null {
  if (fields.length > MAX_FIELDS) {
    return { key: 'fieldEditor.errors.tooMany', params: { max: MAX_FIELDS } }
  }
  const names = new Set<string>()
  const ids = new Set<string>()
  for (const field of fields) {
    const name = field.name.trim()
    if (!name) return { key: 'fieldEditor.errors.nameRequired' }
    if (name.length > FIELD_NAME_MAX_LENGTH) {
      return {
        key: 'fieldEditor.errors.nameTooLong',
        params: { name, max: FIELD_NAME_MAX_LENGTH },
      }
    }
    const key = name.toLocaleLowerCase()
    if (names.has(key))
      return { key: 'fieldEditor.errors.duplicateName', params: { name } }
    names.add(key)
    if (ids.has(field.id)) return { key: 'fieldEditor.errors.invalid' }
    ids.add(field.id)
    if (!FIELD_TYPES.includes(field.type))
      return { key: 'fieldEditor.errors.invalid' }

    if (field.type === 'select' || field.type === 'multiselect') {
      const options = (field.options ?? []).map((option) => option.trim())
      if (!options.length || options.some((option) => !option)) {
        return { key: 'fieldEditor.errors.optionsRequired', params: { name } }
      }
      if (options.length > MAX_SELECT_OPTIONS) {
        return {
          key: 'fieldEditor.errors.tooManyOptions',
          params: { name, max: MAX_SELECT_OPTIONS },
        }
      }
      if (options.some((option) => option.length > OPTION_MAX_LENGTH)) {
        return {
          key: 'fieldEditor.errors.optionTooLong',
          params: { name, max: OPTION_MAX_LENGTH },
        }
      }
      const lower = options.map((option) => option.toLocaleLowerCase())
      if (new Set(lower).size !== lower.length) {
        return { key: 'fieldEditor.errors.duplicateOption', params: { name } }
      }
    }
    if (
      field.type === 'rating' &&
      field.scale !== undefined &&
      !RATING_SCALES.includes(field.scale)
    ) {
      return { key: 'fieldEditor.errors.invalid' }
    }
    if (
      field.type === 'currency' &&
      field.currency !== undefined &&
      !/^[A-Z]{3}$/.test(field.currency)
    ) {
      return { key: 'fieldEditor.errors.invalid' }
    }
  }
  return null
}

/** Fields as they'll be stored: trimmed, with only the extras their type uses. */
export function cleanFields(fields: FieldDefinition[]): FieldDefinition[] {
  return fields.map((field) => ({
    id: field.id,
    name: field.name.trim(),
    type: field.type,
    ...((field.type === 'select' || field.type === 'multiselect') && {
      options: (field.options ?? []).map((option) => option.trim()),
    }),
    ...(field.type === 'currency' && {
      currency: field.currency ?? DEFAULT_CURRENCY,
    }),
    ...(field.type === 'rating' && { scale: field.scale ?? 5 }),
  }))
}

const NUMERIC: FieldType[] = ['number', 'currency', 'rating', 'progress']

/**
 * A stored value carried over to a field's new definition: renamed with its
 * choice options, converted where the types fit (any value to text, numbers
 * between number-like types, text that reads as a number or matches an
 * option, one choice to a list of one and back), or undefined when it no
 * longer fits and will be cleared. A list keeps the choices that survive.
 */
export function carryValue(
  value: FieldValue,
  before: FieldDefinition,
  after: FieldDefinition,
  renames: Record<string, string> = {},
): FieldValue | undefined {
  let candidate: unknown = value
  if (before.type === 'select' && typeof value === 'string') {
    candidate = renames[value] ?? value
  } else if (before.type === 'multiselect' && Array.isArray(value)) {
    candidate = value.map((option) => renames[option] ?? option)
  }

  if (after.type === 'multiselect') {
    if (typeof candidate === 'string') candidate = [candidate]
    if (Array.isArray(candidate)) {
      const options = after.options ?? []
      candidate = candidate.filter((option: string) => options.includes(option))
    }
  } else if (Array.isArray(candidate)) {
    // A list into one value: text lists them, a single choice keeps one.
    candidate =
      after.type === 'text'
        ? candidate.join(', ')
        : candidate.length === 1
          ? candidate[0]
          : undefined
  }

  if (candidate === undefined) return undefined
  // A score keeps its place on a new scale: 4 of 5 becomes 8 of 10.
  if (
    before.type === 'rating' &&
    after.type === 'rating' &&
    typeof candidate === 'number'
  ) {
    const from = before.scale ?? 5
    const to = after.scale ?? 5
    if (from !== to) {
      candidate = Math.max(
        to === 5 ? 1 : 0,
        Math.round((candidate * to) / from),
      )
    }
  }
  if (after.type === 'text' && typeof candidate !== 'string') {
    candidate =
      before.type === 'checkbox'
        ? candidate === true
          ? '✓'
          : ''
        : String(candidate)
  } else if (NUMERIC.includes(after.type) && typeof candidate === 'string') {
    const number = Number(candidate.trim())
    candidate = candidate.trim() && Number.isFinite(number) ? number : undefined
  }
  if (candidate === undefined) return undefined
  const normalized = normalizeFieldValue(after, candidate)
  return normalized === null ? undefined : normalized
}

function sameValue(a: FieldValue | undefined, b: FieldValue | undefined) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index])
  }
  return a === b
}

/** Whether carrying `value` over to `carried` loses some or all of it. */
function isLoss(value: FieldValue, carried: FieldValue | undefined) {
  if (carried === undefined) return true
  return Array.isArray(value) && Array.isArray(carried)
    ? carried.length < value.length
    : false
}

/**
 * An item's data after its fields change from `before` to `after`. Values
 * for removed fields are dropped, values for changed fields carried over
 * (or dropped when they no longer fit), values for other blueprints left
 * alone. Returns null when nothing changes.
 */
export function migrateItemData(
  data: ItemData,
  before: FieldDefinition[],
  after: FieldDefinition[],
  renames: OptionRenames = {},
): ItemData | null {
  const afterById = new Map(after.map((field) => [field.id, field]))
  const updates = new Map<string, FieldValue | undefined>()
  for (const field of before) {
    if (!(field.id in data)) continue
    const value = data[field.id]!
    const updated = afterById.get(field.id)
    const carried = updated
      ? carryValue(value, field, updated, renames[field.id])
      : undefined
    if (!sameValue(carried, value)) updates.set(field.id, carried)
  }
  if (!updates.size) return null
  return Object.fromEntries(
    Object.entries(data).flatMap(([id, value]): [string, FieldValue][] => {
      if (!updates.has(id)) return [[id, value]]
      const carried = updates.get(id)
      return carried === undefined ? [] : [[id, carried]]
    }),
  )
}

/**
 * For each field, how many of `items` would lose their value when saving
 * `after` (removed fields, values that no longer fit, or choices dropped
 * from a list). Renamed options aren't losses. Fields with no losses are left out.
 */
export function valuesLost(
  items: { data: ItemData }[],
  before: FieldDefinition[],
  after: FieldDefinition[],
  renames: OptionRenames = {},
): Map<string, number> {
  const afterById = new Map(after.map((field) => [field.id, field]))
  const lost = new Map<string, number>()
  for (const field of before) {
    const updated = afterById.get(field.id)
    for (const item of items) {
      if (!(field.id in item.data)) continue
      const value = item.data[field.id]!
      const carried = updated
        ? carryValue(value, field, updated, renames[field.id])
        : undefined
      if (isLoss(value, carried)) {
        lost.set(field.id, (lost.get(field.id) ?? 0) + 1)
      }
    }
  }
  return lost
}
