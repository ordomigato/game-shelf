/**
 * Colours for a game with no cover art. The hue comes from the name, so the
 * same game always gets the same cover and different games look different,
 * with nothing to upload or store.
 */
export function generatedCoverColors(name: string): {
  from: string
  to: string
} {
  const hue = nameHue(name)
  return {
    from: `oklch(0.56 0.11 ${hue})`,
    to: `oklch(0.28 0.07 ${hue})`,
  }
}

/** A hue from 0 to 359, stable for a name (ignoring case and spacing). */
export function nameHue(name: string): number {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ')
  // FNV-1a: tiny, fast and spreads similar names apart.
  let hash = 0x811c9dc5
  for (const char of key) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % 360
}
