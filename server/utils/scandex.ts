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
  | { kind: 'none' }

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
  if (status === 404) return { kind: 'none' }
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

/**
 * Asks ScanDex about a normalised barcode. A UPC is a 13-digit EAN with a
 * leading 0, so an unknown 13-digit code that starts with 0 is asked once
 * more as the 12-digit UPC. The token never leaves the server.
 */
export async function askScanDex(code: string): Promise<ScanDexAnswer> {
  const answer = await ask(code)
  if (answer.kind === 'match' || !/^0\d{12}$/.test(code)) return answer
  return ask(code.slice(1))
}
