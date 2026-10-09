import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { createError, getHeader, type H3Event } from 'h3'
import { Resource } from 'sst'

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
  try {
    const payload = await verifier.verify(token)
    return { sub: payload.sub, username: payload.username }
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  }
}
