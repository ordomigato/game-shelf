import { Resource } from 'sst'

const LOOKUP_URL = 'https://scandex.gamery.app/api/v2/lookup'
const TIMEOUT_MS = 5000

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
