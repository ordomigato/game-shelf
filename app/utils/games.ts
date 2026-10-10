/**
 * Splits a platform list for display: the first `max` names, and how many
 * more there are (shown as a "+N" pill).
 */
export function summarizePlatforms(
  platforms: string[],
  max = 3,
): { shown: string[]; hiddenCount: number } {
  return {
    shown: platforms.slice(0, max),
    hiddenCount: Math.max(platforms.length - max, 0),
  }
}

const releaseDateFormats = new Map<string, Intl.DateTimeFormat>()

/**
 * Formats a `YYYY-MM-DD` date for a language, e.g. "November 21, 1991" in
 * English.
 */
export function formatReleaseDate(isoDate: string, locale = 'en'): string {
  let format = releaseDateFormats.get(locale)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      dateStyle: 'long',
      timeZone: 'UTC',
    })
    releaseDateFormats.set(locale, format)
  }
  return format.format(new Date(`${isoDate}T00:00:00Z`))
}
