import { generatedCoverColors } from './generated-cover'

/** Matches what the server stores (`HEX_COLOUR` in shared/utils). */
const HEX = /^#[0-9a-f]{6}$/

/** Whether a stored colour is a hex code (anything else counts as none). */
export const isHexColour = (value: string | null): value is string =>
  value !== null && HEX.test(value)

/** Colours offered as one click in the collection dialog. */
export const COLOUR_PRESETS = [
  { hex: '#ffffff', nameKey: 'collections.colours.white' },
  { hex: '#000000', nameKey: 'collections.colours.black' },
  { hex: '#ef4444', nameKey: 'collections.colours.red' },
  { hex: '#f97316', nameKey: 'collections.colours.orange' },
  { hex: '#facc15', nameKey: 'collections.colours.yellow' },
  { hex: '#22c55e', nameKey: 'collections.colours.green' },
  { hex: '#14b8a6', nameKey: 'collections.colours.teal' },
  { hex: '#3b82f6', nameKey: 'collections.colours.blue' },
  { hex: '#a855f7', nameKey: 'collections.colours.purple' },
  { hex: '#ec4899', nameKey: 'collections.colours.pink' },
] as const

/** A collection's mark colour: the one picked, or one from its name. */
export function collectionColour(collection: {
  title: string
  color: string | null
}): string {
  return isHexColour(collection.color)
    ? collection.color
    : generatedCoverColors(collection.title).from
}

/** Black or white, whichever reads better on a hex colour. */
export function inkOn(hex: string): '#000000' | '#ffffff' {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.179 ? '#000000' : '#ffffff'
}
