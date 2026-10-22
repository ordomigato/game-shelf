import { can, seesAllOf, type Viewer } from './access'
import type { ChartWidget } from '../types/charts'
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
 * for fields outside `fields` (deleted fields) are left untouched.
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

/** Whether the viewer may read this field: the owner all, others the unhidden. */
function mayRead(viewer: Viewer, field: FieldDefinition): boolean {
  return can(viewer.subject, 'field.read', {
    ownerId: viewer.ownerId,
    hidden: field.hidden === true,
  })
}

/** The ids of the fields kept from this viewer. */
function hiddenIds(viewer: Viewer, fields: FieldDefinition[]): Set<string> {
  return new Set(fields.filter((f) => !mayRead(viewer, f)).map((f) => f.id))
}

const seesAll = (viewer: Viewer) => seesAllOf(viewer.subject, viewer.ownerId)

/** The field ids a chart reads: its measure, grouping and timeline. */
function widgetFieldIds(widget: ChartWidget): string[] {
  const ids: string[] = []
  if ('fieldId' in widget.measure) ids.push(widget.measure.fieldId)
  if (widget.groupBy) ids.push(widget.groupBy)
  if (widget.timeline) ids.push(widget.timeline.source)
  return ids
}

/**
 * The charts a visitor may see: the owner gets all of them, and a visitor
 * gets none that read a hidden field.
 */
export function chartsFor(
  viewer: Viewer,
  fields: FieldDefinition[],
  dashboard: ChartWidget[],
): ChartWidget[] {
  if (seesAll(viewer)) return dashboard
  const hidden = hiddenIds(viewer, fields)
  return dashboard.filter(
    (widget) => !widgetFieldIds(widget).some((id) => hidden.has(id)),
  )
}

/**
 * An item's values as the viewer may see them. A visitor gets only the
 * values of the given (visible) fields.
 */
export function dataFor(
  viewer: Viewer,
  visibleFields: FieldDefinition[],
  data: ItemData,
): ItemData {
  if (seesAll(viewer)) return data
  const visible = new Set(visibleFields.map((f) => f.id))
  return Object.fromEntries(
    Object.entries(data).filter(([id]) => visible.has(id)),
  )
}

/**
 * The fields a visitor may see, given the ids that have a value somewhere
 * in what they're viewing: a field the owner keeps for other games isn't
 * listed. Hidden fields are never listed.
 */
export function visitorFields(
  viewer: Viewer,
  fields: FieldDefinition[],
  usedIds: ReadonlySet<string>,
): FieldDefinition[] {
  return fields.filter(
    (field) => mayRead(viewer, field) && usedIds.has(field.id),
  )
}

/**
 * The fields to show someone viewing a collection. The owner sees all of
 * them. A visitor sees only the fields that some game in the collection has
 * a value for, or that one of its charts uses (see `visitorFields`).
 */
export function fieldsFor(
  viewer: Viewer,
  fields: FieldDefinition[],
  items: { data: ItemData }[],
  dashboard: ChartWidget[],
): FieldDefinition[] {
  if (seesAll(viewer)) return fields
  const used = new Set<string>()
  for (const item of items) {
    for (const id of Object.keys(item.data)) used.add(id)
  }
  for (const widget of dashboard) {
    for (const id of widgetFieldIds(widget)) used.add(id)
  }
  return visitorFields(viewer, fields, used)
}
