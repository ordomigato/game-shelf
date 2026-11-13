const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

/**
 * How long ago a time was, in the reader's language and in the largest whole
 * unit: "2 hours ago", "yesterday". Anything under a minute is "now".
 */
export function timeAgo(
  time: string | Date,
  now: Date,
  locale: string,
): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const elapsed = Math.max(0, now.getTime() - new Date(time).getTime())
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return format.format(-Math.floor(elapsed / size), unit)
  }
  return format.format(0, 'second')
}
