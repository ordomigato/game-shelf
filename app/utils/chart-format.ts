import type { ChartMeasure } from '#shared/types/charts'
import type { FieldDefinition } from '#shared/types/collection'
import { formatFieldValue } from './field-display'

/**
 * A measured value as text: counts as whole numbers, shares as a
 * percentage, amounts with their currency, averages to one decimal.
 */
export function formatMeasure(
  value: number | null,
  measure: ChartMeasure,
  fields: FieldDefinition[],
  locale = 'en',
): string {
  if (value === null) return '–'
  if (measure.op === 'count') {
    return new Intl.NumberFormat(locale).format(Math.round(value))
  }
  if (measure.op === 'percent') return `${Math.round(value)}%`
  const field = fields.find((candidate) => candidate.id === measure.fieldId)
  if (!field) return String(value)
  if (field.type === 'currency') return formatFieldValue(field, value, locale)
  const rounded = measure.op === 'average' ? Math.round(value * 10) / 10 : value
  if (field.type === 'progress') return `${Math.round(rounded)}%`
  if (field.type === 'rating') {
    const text = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    }).format(rounded)
    return (field.scale ?? 5) === 5 ? `${text} ★` : `${text}/${field.scale}`
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    rounded,
  )
}

/** A `YYYY-MM` or `YYYY` period as text, like "Mar 2026" or "2026". */
export function formatBucket(bucket: string, locale = 'en'): string {
  if (bucket.length === 4) return bucket
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${bucket}-01T00:00:00Z`))
}
