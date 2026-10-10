/**
 * Returns `value` when it's a path on this site, otherwise `fallback`. Used
 * for `?redirect=` after sign-in, so a crafted link can't send someone to
 * another site.
 */
export function safeRedirect(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  if (value.includes('\\')) return fallback
  return value
}
