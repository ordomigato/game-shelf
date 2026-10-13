/**
 * The colours a collection can be given (its mark in the sidebar). Stored by
 * id, so the shade can change later without touching the database. A
 * collection with no colour gets one from its name. The shades are in
 * `app/utils/collection-colour.ts`.
 */
export const COLLECTION_COLOUR_IDS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const

export type CollectionColour = (typeof COLLECTION_COLOUR_IDS)[number]
