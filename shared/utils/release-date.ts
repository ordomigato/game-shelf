/**
 * A game's release date and how exact it is. IGDB always gives a timestamp,
 * even for a game only known to a month, a year or a quarter, so the
 * catalog keeps the precision beside the date.
 */

export const RELEASE_PRECISIONS = [
  'day',
  'month',
  'year',
  'quarter',
  'tbd',
] as const

export type ReleasePrecision = (typeof RELEASE_PRECISIONS)[number]

type Translate = (key: string, params?: Record<string, unknown>) => string

/**
 * The date as people read it, in the viewer's locale and at the precision
 * known: "Nov 18, 2011", "Nov 2011", "2011", "Q4 2026" or "TBD". Dates are
 * UTC days, so they never shift with the viewer's time zone. An unknown
 * precision shows the full date. Null when there is nothing to show.
 */
export function formatReleased(
  date: string | null,
  precision: ReleasePrecision | null,
  locale: string,
  t: Translate,
): string | null {
  if (precision === 'tbd') return t('table.releasedTbd')
  if (!date) return null
  const day = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(day.getTime())) return null
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(day)
  switch (precision) {
    case 'month':
      return format({ month: 'short', year: 'numeric' })
    case 'year':
      return format({ year: 'numeric' })
    case 'quarter':
      return t('table.releasedQuarter', {
        quarter: Math.floor(day.getUTCMonth() / 3) + 1,
        year: format({ year: 'numeric' }),
      })
    default:
      return format({ dateStyle: 'medium' })
  }
}

/** The date a table sorts by: none for TBD, so it goes last with the empty. */
export function releaseSortDate(
  date: string | null,
  precision: ReleasePrecision | null,
): string | undefined {
  return precision === 'tbd' ? undefined : (date ?? undefined)
}
