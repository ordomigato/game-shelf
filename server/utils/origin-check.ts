import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Whether a request may reach the server. `secret` is the value CloudFront's
 * viewer-request function adds as `x-origin-secret`. An empty `secret` means
 * the deployed server has none configured, and then nothing is allowed
 * (fail closed). Both sides are hashed first so the comparison takes the
 * same time for any input and any length.
 */
export function originAllowed(
  secret: string,
  header: string | undefined,
): boolean {
  if (!secret || !header) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(secret), digest(header))
}
