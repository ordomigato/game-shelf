import { getHeader, type H3Event } from 'h3'

/**
 * How many requests a client may make per minute, by kind of request. Kept
 * together so they're easy to tune. `perClient` is counted per viewer IP
 * (changes by signed-in user id, see `USER_WRITE_LIMIT`). `perInstance` is a
 * ceiling on everyone together in one Lambda instance, which still holds if
 * someone invents many IPs by calling the Lambda URL directly (see
 * `clientIp`).
 */
export const LIMIT_WINDOW_MS = 60_000
export const REQUEST_LIMITS = {
  /** Routes that call IGDB, which allows about 4 requests a second. */
  igdb: { perClient: 30, perInstance: 150 },
  /** The browser's performance beacon. Over the limit it is dropped. */
  vitals: { perClient: 30, perInstance: 300 },
  /** Pages and API routes anyone can read, like shared shelves and Explore. */
  public: { perClient: 120, perInstance: 1200 },
  /** Changes (POST, PUT, PATCH, DELETE) before sign-in is known. */
  write: { perClient: 60, perInstance: 600 },
  /** The rest of the API and every other page, as a backstop. */
  other: { perClient: 300, perInstance: 3000 },
} as const

export type LimitGroup = keyof typeof REQUEST_LIMITS

/** Signed-in users' changes per minute, counted once the token is verified. */
export const USER_WRITE_LIMIT = 60

const SKIPPED = /^\/(_nuxt|__nuxt|_ipx|favicon)/
const IGDB_ROUTES = /^\/api\/(games|library-items\/igdb|import\/match)(\/|$)/
const PUBLIC_ROUTES = /^\/(api\/)?(u|explore)(\/|$|\.)/
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Whether a request changes data. Only API routes are counted as changes. */
export function isWrite(method: string, rawPath: string): boolean {
  return rawPath.startsWith('/api/') && !SAFE_METHODS.has(method.toUpperCase())
}

/**
 * Which limit a request counts against, or null for none (build files).
 * A change that carries a sign-in token counts against the backstop here
 * and against its user's own limit once the token is verified, so people
 * sharing one IP don't use up each other's changes.
 */
export function limitGroupFor(
  method: string,
  rawPath: string,
  hasToken = false,
): LimitGroup | null {
  const path = rawPath.split(/[?#]/)[0] ?? rawPath
  if (SKIPPED.test(path)) return null
  if (path === '/api/vitals') return 'vitals'
  if (IGDB_ROUTES.test(path)) return 'igdb'
  if (isWrite(method, path)) return hasToken ? 'other' : 'write'
  if (PUBLIC_ROUTES.test(path)) return 'public'
  return 'other'
}

const ADDRESS = /^[0-9a-fA-F:.]{2,45}$/

/**
 * The viewer's IP. The Lambda's own sourceIp is CloudFront's address, so
 * the site's CloudFront function copies the viewer's IP into `x-viewer-ip`
 * (see sst.config.ts), replacing anything the browser sent. Without that
 * header (local runs, or a direct call to the Lambda URL) the connection's
 * own address is used. Null when neither is known, like an internal call a
 * page makes to its own API: those aren't limited.
 *
 * The Lambda URL is public, so a direct caller can set `x-viewer-ip` to
 * anything and pick its own bucket. Nothing in the request tells that apart
 * from CloudFront, which is why `perInstance` exists. Closing the URL to
 * everything but CloudFront is the real fix.
 */
export function clientIp(event: H3Event): string | null {
  const header = getHeader(event, 'x-viewer-ip')?.trim()
  if (header && ADDRESS.test(header)) return header.toLowerCase()
  const req = event.node.req as {
    __unenv__?: {
      event?: { requestContext?: { http?: { sourceIp?: string } } }
    }
    socket?: { remoteAddress?: string }
  }
  const direct =
    req.__unenv__?.event?.requestContext?.http?.sourceIp ??
    req.socket?.remoteAddress
  return direct && ADDRESS.test(direct) ? direct.toLowerCase() : null
}
