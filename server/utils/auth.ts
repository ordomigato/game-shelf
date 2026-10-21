import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { createError, getHeader, setResponseHeader, type H3Event } from 'h3'
import { Resource } from 'sst'
import { log } from './log'
import { memoryLimiter } from './memory-limiter'
import { LIMIT_WINDOW_MS, USER_WRITE_LIMIT } from './request-limits'

/** What the server knows about a request's user, from its verified token. */
export interface AuthClaims {
  /** Cognito's stable user id. */
  sub: string
  /** Cognito's internal username (a uuid here), needed for admin calls. */
  username: string
}

let verifier: ReturnType<typeof createVerifier> | undefined

function createVerifier() {
  return CognitoJwtVerifier.create({
    userPoolId: Resource.Users.id,
    clientId: Resource.WebClient.id,
    tokenUse: 'access',
  })
}

/** Pulls the token out of an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match?.[1] ?? null
}

/**
 * Counts a change against its signed-in user's own limit (the rate-limit
 * middleware flags changes). Keyed by the verified user id, so it can't be
 * dodged by switching IPs or blamed on a neighbour sharing one.
 */
function limitUserWrite(event: H3Event, sub: string) {
  if (!event.context.limitUserWrites) return
  // Counted once, however many times a route asks who the user is.
  event.context.limitUserWrites = false
  const verdict = memoryLimiter.hit(
    `user-write:${sub}`,
    USER_WRITE_LIMIT,
    LIMIT_WINDOW_MS,
  )
  if (verdict.allowed) return
  log('warn', 'http.rate_limited', { group: 'user-write' })
  setResponseHeader(event, 'Retry-After', verdict.retryAfter)
  throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
}

/**
 * Verifies the request's Cognito access token (signature, expiry, issuer,
 * client) and returns its claims, or throws 401. Routes take the user from
 * here only, never from the body, query or params.
 */
export async function requireAuth(event: H3Event): Promise<AuthClaims> {
  const token = bearerToken(getHeader(event, 'authorization'))
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  }
  verifier ??= createVerifier()
  let claims: AuthClaims
  try {
    const payload = await verifier.verify(token)
    claims = { sub: payload.sub, username: payload.username }
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  }
  limitUserWrite(event, claims.sub)
  return claims
}

/**
 * Like `requireAuth`, but a request without a token is allowed (returns
 * null). A token that is present but invalid is still rejected with 401.
 */
export async function optionalAuth(event: H3Event): Promise<AuthClaims | null> {
  if (!getHeader(event, 'authorization')) return null
  return requireAuth(event)
}
