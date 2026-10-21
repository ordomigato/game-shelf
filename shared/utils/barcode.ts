/** Barcode lengths a game box can carry: EAN-8, UPC-A, EAN-13, GTIN-14. */
const LENGTHS = new Set([8, 12, 13, 14])

/** How long a barcode ScanDex matched is reused before asking again. */
export const BARCODE_MATCH_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** How long a barcode ScanDex had no game for is remembered. */
export const BARCODE_NO_MATCH_TTL_MS = 24 * 60 * 60 * 1000

/** The most barcodes the scanner keeps and adds in one go. */
export const MAX_SCAN_BATCH = 100

/** Whether the last digit is the right check digit for the ones before it. */
function checkDigitOk(digits: string): boolean {
  let sum = 0
  for (let i = digits.length - 2, weight = 3; i >= 0; i--) {
    sum += Number(digits[i]) * weight
    weight = weight === 3 ? 1 : 3
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1))
}

/** The 12-digit UPC-A a zero-suppressed UPC-E (8 digits) stands for. */
function expandUpcE(digits: string): string {
  const [system, a, b, c, d, e, f, check] = digits.split('')
  const last = Number(f)
  const body =
    last <= 2
      ? `${a}${b}${f}0000${c}${d}${e}`
      : last === 3
        ? `${a}${b}${c}00000${d}${e}`
        : last === 4
          ? `${a}${b}${c}${d}00000${e}`
          : `${a}${b}${c}${d}${e}0000${f}`
  return `${system}${body}${check}`
}

/**
 * The key a barcode is looked up by, or null when it isn't a real barcode:
 * digits only, 8, 12, 13 or 14 long, with a correct check digit. A 12-digit
 * UPC and its 13-digit EAN (a leading 0) give the same key, so do a UPC-E
 * and the UPC it stands for, and a 14-digit GTIN with a leading 0.
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\s+/g, '')
  if (!/^\d+$/.test(digits) || !LENGTHS.has(digits.length)) return null
  if (digits.length === 8 && !checkDigitOk(digits)) {
    if (!/^[01]/.test(digits)) return null
    const upc = expandUpcE(digits)
    return checkDigitOk(upc) ? `0${upc}` : null
  }
  if (!checkDigitOk(digits)) return null
  if (digits.length === 12) return `0${digits}`
  if (digits.length === 14 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

/** What our cache keeps of ScanDex's answer. */
export interface CachedBarcode {
  igdbId: number | null
  fetchedAt: Date
}

/** Whether a cached answer can still be used, or ScanDex is asked again. */
export function barcodeCacheFresh(row: CachedBarcode, now: Date): boolean {
  const ttl =
    row.igdbId === null ? BARCODE_NO_MATCH_TTL_MS : BARCODE_MATCH_TTL_MS
  return now.getTime() - row.fetchedAt.getTime() < ttl
}
