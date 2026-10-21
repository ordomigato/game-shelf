import { getHeader, type H3Event } from 'h3'

/**
 * How many requests a client may make per minute, by kind of request. Kept
 * together so they're easy to tune. `perClient` is counted per viewer IP
 * (changes by signed-in user id, see `USER_WRITE_LIMIT`). `perInstance` is a
 * ceiling on everyone together in one Lambda instance.
 */
export const LIMIT_WINDOW_MS = 60_000
export const REQUEST_LIMITS = {
  /** Routes that call IGDB, which allows about 4 requests a second. */
  igdb: { perClient: 30, perInstance: 150 },
  /**
   * Barcode lookups, which can reach ScanDex. A shelf is scanned at about a
   * box a second, so this is looser than IGDB's.
   */
  barcodes: { perClient: 120, perInstance: 600 },
  /** The browser's performance beacon. Over the limit it is dropped. */
  vitals: { perClient: 30, perInstance: 300 },
  /** The sitemap, rebuilt from the database whenever CloudFront misses. */
  sitemap: { perClient: 10, perInstance: 60 },
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

/** Build files and the site icon, which CloudFront serves without the Lambda. */
const SKIPPED = /^\/(_nuxt|__nuxt|_ipx)(\/|$)|^\/favicon\.(ico|svg|png)$/
const IGDB_ROUTES = /^\/api\/(games|library-items\/igdb|import\/match)(\/|$)/
const BARCODE_ROUTES = /^\/api\/barcodes(\/|$)/
const SITEMAP_ROUTES = /^\/sitemaps?(\/|\.xml$|$)/
const PUBLIC_ROUTES = /^\/(api\/)?(u|explore)(\/|$|\.)/
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const JWT_BEARER = /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/i

/** The path without query, repeated slashes or a trailing slash. */
export function normalizePath(rawPath: string): string {
  const path = (rawPath.split(/[?#]/)[0] ?? '').replace(/\/{2,}/g, '/')
  return path.length > 1 ? path.replace(/\/+$/, '') : path || '/'
}

/** Whether a request changes data. Only API routes are counted as changes. */
export function isWrite(method: string, rawPath: string): boolean {
  return (
    normalizePath(rawPath).startsWith('/api/') &&
    !SAFE_METHODS.has(method.toUpperCase())
  )
}

/** Whether the header looks like a Cognito token (three dotted parts). */
export function hasBearerToken(header: string | undefined): boolean {
  return !!header && JWT_BEARER.test(header.trim())
}

/**
 * Which limit a request counts against, or null for none (build files).
 * A change that carries a well-formed token counts against the backstop
 * here, and against its user's own limit once the token is verified. That
 * way signed-in people sharing one IP (a home, a school) don't use up each
 * other's changes. A made-up token only gets the backstop's larger
 * allowance, and still fails to sign in.
 */
export function limitGroupFor(
  method: string,
  rawPath: string,
  hasToken = false,
): LimitGroup | null {
  const path = normalizePath(rawPath)
  if (SKIPPED.test(path)) return null
  if (path === '/api/vitals') return 'vitals'
  if (IGDB_ROUTES.test(path)) return 'igdb'
  if (BARCODE_ROUTES.test(path)) return 'barcodes'
  if (SITEMAP_ROUTES.test(path)) return 'sitemap'
  if (isWrite(method, path)) return hasToken ? 'other' : 'write'
  if (PUBLIC_ROUTES.test(path)) return 'public'
  return 'other'
}

const ADDRESS = /^[0-9a-fA-F:.]{2,45}$/

/**
 * What a client's counts are filed under: an IPv4 address as it is, an IPv6
 * address as its /64. A home gets a whole /64, so single addresses would be
 * free to rotate.
 */
export function clientKey(ip: string): string {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) return mapped[1]!
  if (!ip.includes(':')) return ip
  const [head = '', tail] = ip.toLowerCase().split('::')
  const front = head ? head.split(':') : []
  const back = tail ? tail.split(':') : []
  const groups =
    tail === undefined
      ? front
      : [
          ...front,
          ...Array<string>(Math.max(0, 8 - front.length - back.length)).fill(
            '0',
          ),
          ...back,
        ]
  const prefix = groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
  return `${prefix.join(':')}::/64`
}

/**
 * The viewer's IP. The Lambda only sees CloudFront's address, so the site's
 * CloudFront function copies the viewer's IP into `x-viewer-ip` (see
 * sst.config.ts), replacing anything the browser sent. On deployed stages
 * the origin check (server/middleware/origin-check.ts) refuses anything
 * that did not come through that function, so the header can be trusted.
 * The server's own calls to itself while rendering a page forward it too
 * (use `useRequestFetch`, not a bare `$fetch`, so they count as the
 * viewer). Without the header (local runs) the connection's address is
 * used, and null when that is unknown too.
 */
export function clientIp(event: H3Event): string | null {
  const header = getHeader(event, 'x-viewer-ip')?.trim()
  if (header && ADDRESS.test(header)) return header
  const direct = event.node.req.socket?.remoteAddress
  return direct && ADDRESS.test(direct) ? direct : null
}
