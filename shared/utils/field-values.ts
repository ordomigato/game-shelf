import type { FieldDefinition, FieldValue, ItemData } from '../types/collection'

export const TEXT_VALUE_MAX_LENGTH = 500

/**
 * Checks one value against its field's type. Returns the value to store
 * (trimmed or rounded where that matters), or undefined when it isn't
 * valid. `null` means "clear this value" and is always allowed.
 */
export function normalizeFieldValue(
  field: FieldDefinition,
  value: unknown,
): FieldValue | null | undefined {
  if (value === null) return null
  switch (field.type) {
    case 'text': {
      if (typeof value !== 'string') return undefined
      const text = value.trim()
      if (text.length > TEXT_VALUE_MAX_LENGTH) return undefined
      return text || null
    }
    case 'select':
      return typeof value === 'string' && (field.options ?? []).includes(value)
        ? value
        : undefined
    case 'multiselect': {
      if (!Array.isArray(value)) return undefined
      if (value.some((option) => typeof option !== 'string')) return undefined
      const options = field.options ?? []
      if (value.some((option) => !options.includes(option))) return undefined
      // Stored once each, in the field's option order. Empty clears.
      const chosen = options.filter((option) => value.includes(option))
      return chosen.length ? chosen : null
    }
    case 'date':
      return typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
        new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
        ? value
        : undefined
    case 'checkbox':
      return typeof value === 'boolean' ? value : undefined
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined
    case 'currency':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.round(value * 100) / 100
        : undefined
    case 'rating': {
      // Stars start at one. Scores out of 10 or 100 can be zero.
      const scale = field.scale ?? 5
      const lowest = scale === 5 ? 1 : 0
      return Number.isInteger(value) &&
        (value as number) >= lowest &&
        (value as number) <= scale
        ? (value as number)
        : undefined
    }
    case 'progress':
      return typeof value === 'number' && value >= 0 && value <= 100
        ? Math.round(value)
        : undefined
  }
}

/**
 * Applies `changes` (field id to value, `null` to clear) to an item's data,
 * allowing only the given fields. Returns the new data, or the ids of the
 * fields whose values were rejected (unknown field or wrong type). Values
 * for fields outside `fields` (from other blueprints) are left untouched.
 */
export function applyFieldValues(
  data: ItemData,
  fields: FieldDefinition[],
  changes: Record<string, unknown>,
): { data: ItemData } | { invalidFieldIds: string[] } {
  const byId = new Map(fields.map((field) => [field.id, field]))
  const set: ItemData = {}
  const cleared = new Set<string>()
  const invalidFieldIds: string[] = []
  for (const [id, raw] of Object.entries(changes)) {
    const field = byId.get(id)
    const value = field ? normalizeFieldValue(field, raw) : undefined
    if (value === undefined) invalidFieldIds.push(id)
    else if (value === null) cleared.add(id)
    else set[id] = value
  }
  const next: ItemData = Object.fromEntries(
    Object.entries({ ...data, ...set }).filter(([id]) => !cleared.has(id)),
  )
  return invalidFieldIds.length ? { invalidFieldIds } : { data: next }
}
