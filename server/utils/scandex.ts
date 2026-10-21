import { Resource } from 'sst'
import { log } from './log'

const LOOKUP_URL = 'https://scandex.gamery.app/api/v2/lookup'
const CREATE_URL = 'https://scandex.gamery.app/api/v2/create'
const TIMEOUT_MS = 5000
/** The person who pressed Send waits for this, so keep it short. */
const CREATE_TIMEOUT_MS = 5000

/** What ScanDex knows about a barcode. */
export type ScanDexAnswer =
  | {
      kind: 'match'
      igdbId: number
      platformId: number | null
      platformName: string | null
    }
  /** `notFound` is a 404: ScanDex has never seen the barcode. */
  | { kind: 'none'; notFound?: true }

/** ScanDex couldn't be asked, or didn't answer in a way we understand. */
export class ScanDexError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const positiveInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null

/**
 * Reads ScanDex's reply to a lookup. A 404 is an unknown barcode, and a 200
 * with no IGDB game (a known barcode that was never matched) is the same
 * as far as we care. Anything else is an error to try again later.
 */
export function mapScanDexResponse(
  status: number,
  body: unknown,
): ScanDexAnswer {
  if (status === 404) return { kind: 'none', notFound: true }
  if (status !== 200 || !isRecord(body)) {
    throw new ScanDexError(`ScanDex answered ${status}`)
  }
  const meta = body.igdb_metadata
  if (!isRecord(meta)) return { kind: 'none' }
  const igdbId = positiveInt(meta.id)
  if (igdbId === null) return { kind: 'none' }
  const platform = isRecord(meta.platform) ? meta.platform : null
  const platformId = positiveInt(platform?.id)
  return {
    kind: 'match',
    igdbId,
    platformId,
    platformName:
      platformId !== null && typeof platform?.name === 'string'
        ? platform.name.slice(0, 100)
        : null,
  }
}

async function ask(value: string): Promise<ScanDexAnswer> {
  let response: Response
  try {
    response = await fetch(`${LOOKUP_URL}?value=${encodeURIComponent(value)}`, {
      headers: {
        Authorization: `Bearer ${Resource.ScanDexToken.value}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    throw new ScanDexError('ScanDex could not be reached', { cause: error })
  }
  const body: unknown = await response.json().catch(() => null)
  return mapScanDexResponse(response.status, body)
}

/** The same barcode as an EAN-13 or UPC-A, or null when it has no other form. */
export function otherForm(code: string): string | null {
  if (/^\d{12}$/.test(code)) return `0${code}`
  if (/^0\d{12}$/.test(code)) return code.slice(1)
  return null
}

/**
 * Asks ScanDex about a barcode in the form it was scanned (a 12-digit UPC
 * as 12 digits, an EAN-13 as 13). A match or a known-but-unmatched answer
 * costs one call. Only a 404 is asked again in the other form, and if that
 * second call fails the first answer ("none") stands. The token never
 * leaves the server.
 */
export async function askScanDex(
  scanned: string,
  fetchOne: (value: string) => Promise<ScanDexAnswer> = ask,
): Promise<ScanDexAnswer> {
  const first = await fetchOne(scanned)
  const other = otherForm(scanned)
  if (first.kind !== 'none' || !first.notFound || !other) return first
  try {
    return await fetchOne(other)
  } catch (error) {
    if (error instanceof ScanDexError) return first
    throw error
  }
}

/** What ScanDex is told about a box it didn't know. */
export interface ScanDexSuggestion {
  igdbId: number
  platformId: number
  /** The IGDB platform's name. */
  platform: string
  /** The IGDB game's name. */
  name: string
  /** The normalised barcode, as digits. */
  code: string
}

/** How a suggestion went. `status` is 0 when ScanDex couldn't be reached. */
export type ScanDexSubmitResult =
  { ok: true } | { ok: false; status: number; message: string | null }

/** The most of ScanDex's error text that is kept. */
const MESSAGE_CHARS = 200

/**
 * ScanDex's own words for why it said no: a JSON `message`, `error` or
 * `detail`, else the plain text, trimmed. Null when it said nothing.
 */
export function readErrorMessage(raw: string): string | null {
  let text = raw
  try {
    const body: unknown = JSON.parse(raw)
    if (isRecord(body)) {
      const found = [body.message, body.error, body.detail].find(
        (value) => typeof value === 'string' && value.trim(),
      )
      if (typeof found === 'string') text = found
    }
  } catch {
    // Not JSON: the text is used as it is.
  }
  const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, MESSAGE_CHARS)
  return trimmed || null
}

/** The same text with every digit hidden, which is safe to log. */
export const maskDigits = (text: string) => text.replace(/\d/g, '#')

/**
 * Suggests a game for a barcode to ScanDex. Any 2xx is success. Anything
 * else, or no answer within a few seconds, is a failure that carries
 * ScanDex's status and error text for the person who chose to share. The
 * log gets the status and that text with every digit masked, never the
 * barcode or the game. The request body is built here and nowhere else.
 * Never throws.
 */
export async function submitToScanDex(
  suggestion: ScanDexSuggestion,
): Promise<ScanDexSubmitResult> {
  // ScanDex reads fields the way its lookup does, not from a JSON body (a
  // JSON post answered "The parameter 'value' is required"). They go both in
  // the address and as a form body. The barcode goes as text, keeping its
  // leading zeros.
  const fields = new URLSearchParams({
    igdb_id: String(suggestion.igdbId),
    platform_id: String(suggestion.platformId),
    platform: suggestion.platform,
    name: suggestion.name,
    value: suggestion.code,
  })
  try {
    const response = await fetch(`${CREATE_URL}?${fields}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Resource.ScanDexToken.value}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: fields,
      signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
    })
    if (response.status >= 200 && response.status <= 299) return { ok: true }
    const message = readErrorMessage(await response.text().catch(() => ''))
    log('warn', 'barcode.suggest_failed', {
      status: response.status,
      ...(message && { message: maskDigits(message) }),
    })
    return { ok: false, status: response.status, message }
  } catch {
    log('warn', 'barcode.suggest_failed', { status: 0 })
    return { ok: false, status: 0, message: null }
  }
}
