import type { CollectionColour } from '#shared/utils/collection-colours'
import { generatedCoverColors } from './generated-cover'

const HUES: Record<CollectionColour, number> = {
  red: 25,
  orange: 55,
  yellow: 90,
  green: 145,
  teal: 190,
  blue: 250,
  purple: 300,
  pink: 350,
}

/** The CSS colour of a preset, in the same shade as generated covers. */
export function presetColour(id: CollectionColour): string {
  return `oklch(0.56 0.11 ${HUES[id]})`
}

/** A collection's mark colour: the one picked, or one from its name. */
export function collectionColour(collection: {
  title: string
  color: CollectionColour | null
}): string {
  return collection.color
    ? presetColour(collection.color)
    : generatedCoverColors(collection.title).from
}
