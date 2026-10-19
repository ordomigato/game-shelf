import type { FieldDefinition } from '../types/collection'

type FieldTemplate = Omit<FieldDefinition, 'id'>

/**
 * Fields offered in the field editor, for the facts a collector or a
 * player tends to keep. Nothing a game already has (name, year, genres,
 * platforms, cover) is here. Names are stored as the user's own data once
 * added, so they start in English.
 */
export const SUGGESTED_FIELDS: FieldTemplate[] = [
  {
    name: 'Condition',
    type: 'select',
    options: ['Sealed', 'Complete in box', 'Game and box', 'Loose'],
  },
  { name: 'Price paid', type: 'currency', currency: 'USD' },
  { name: 'Purchased on', type: 'date' },
  {
    name: 'Region',
    type: 'select',
    options: ['NTSC-U', 'PAL', 'NTSC-J', 'Other'],
  },
  { name: 'Notes', type: 'text' },
  {
    name: 'Status',
    type: 'select',
    options: ['Backlog', 'Playing', 'Finished', 'Dropped'],
  },
  { name: 'Progress', type: 'progress' },
  { name: 'Rating', type: 'rating' },
  { name: 'Hours played', type: 'number' },
]

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/** The suggestions whose name the user doesn't already have a field for. */
export function availableSuggestions(
  fields: { name: string }[],
): FieldTemplate[] {
  return SUGGESTED_FIELDS.filter(
    (suggestion) =>
      !fields.some((field) => sameName(field.name, suggestion.name)),
  )
}

/** A suggestion as a field, with a new random id and its own options. */
export function fieldFromSuggestion(
  suggestion: FieldTemplate,
  newId: () => string = () => crypto.randomUUID(),
): FieldDefinition {
  return {
    ...suggestion,
    ...(suggestion.options && { options: [...suggestion.options] }),
    id: newId(),
  }
}
