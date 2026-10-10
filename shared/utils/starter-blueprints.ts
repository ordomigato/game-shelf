import type { FieldDefinition } from '../types/collection'

export type StarterBlueprint = 'collector' | 'player' | 'blank'
export const STARTER_BLUEPRINTS: StarterBlueprint[] = [
  'collector',
  'player',
  'blank',
]

type FieldTemplate = Omit<FieldDefinition, 'id'>

/**
 * Blueprints offered when creating a collection. The Wishlist starts with
 * none. Names are stored as the user's own data once created, so they start
 * in English.
 */
const templates: Record<StarterBlueprint | 'wishlist', FieldTemplate[]> = {
  collector: [
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
  ],
  player: [
    { name: 'Platform', type: 'text' },
    {
      name: 'Status',
      type: 'select',
      options: ['Backlog', 'Playing', 'Finished', 'Dropped'],
    },
    { name: 'Progress', type: 'progress' },
    { name: 'Rating', type: 'rating' },
    { name: 'Hours played', type: 'number' },
  ],
  wishlist: [],
  blank: [],
}

/** A fresh copy of a starter's fields, each with a new random id. */
export function starterFields(
  starter: StarterBlueprint | 'wishlist',
  newId: () => string = () => crypto.randomUUID(),
): FieldDefinition[] {
  return templates[starter].map((field) => ({
    ...field,
    ...(field.options && { options: [...field.options] }),
    id: newId(),
  }))
}
