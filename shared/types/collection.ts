export type FieldType =
  'text' | 'number' | 'currency' | 'date' | 'checkbox' | 'select'

/**
 * One user-defined column on a collection. `id` is stable and is the key
 * used in each item's `data`, so a field can be renamed without touching
 * its items.
 */
export interface FieldDefinition {
  id: string
  name: string
  type: FieldType
  /** Allowed values, for `select` fields only. */
  options?: string[]
}

export type FieldValue = string | number | boolean | null

/** An item's values, keyed by `FieldDefinition.id`. */
export type ItemData = Record<string, FieldValue>

export type CollectionVisibility = 'private' | 'public'
