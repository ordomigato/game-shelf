import type { FieldDefinition, FieldValue } from '#shared/types/collection'
import { formatReleaseDate } from './games'

const numberFormats = new Map<string, Intl.NumberFormat>()

function numberFormat(
  locale: string,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`
  let format = numberFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(locale, options)
    numberFormats.set(key, format)
  }
  return format
}

/**
 * A field value as plain text, for display and for searching. Empty values
 * give an empty string. Checkbox and rating cells draw their own icons, so
 * their text is only used for searching and screen readers.
 */
export function formatFieldValue(
  field: FieldDefinition,
  value: FieldValue | undefined,
  locale = 'en',
): string {
  if (value === undefined) return ''
  if (Array.isArray(value)) return value.join(', ')
  switch (field.type) {
    case 'number':
      return numberFormat(locale).format(Number(value))
    case 'currency':
      // Fields made before currencies existed show the amount alone.
      return numberFormat(
        locale,
        field.currency
          ? { style: 'currency', currency: field.currency }
          : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      ).format(Number(value))
    case 'progress':
      return `${value}%`
    case 'rating':
      // Stars draw themselves. Other scales read as "8/10".
      return (field.scale ?? 5) === 5
        ? String(value)
        : `${value}/${field.scale}`
    case 'date':
      return formatReleaseDate(String(value), locale)
    default:
      return String(value)
  }
}

/**
 * Orders two values of the same field, ascending. Text and select compare
 * as words in the reader's language, numbers numerically, dates by date,
 * checkboxes with ticked first, lists of choices by their choices in
 * order. Empty values are handled by the table,
 * which always puts them last.
 */
export function compareFieldValues(
  field: FieldDefinition,
  a: FieldValue,
  b: FieldValue,
  locale = 'en',
): number {
  switch (field.type) {
    case 'number':
    case 'currency':
    case 'rating':
    case 'progress':
      return Number(a) - Number(b)
    case 'checkbox':
      return Number(b) - Number(a)
    case 'date':
      return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
    default:
      return formatFieldValue(field, a).localeCompare(
        formatFieldValue(field, b),
        locale,
        {
          sensitivity: 'base',
          numeric: true,
        },
      )
  }
}
