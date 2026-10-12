import type { H3Event } from 'h3'

/** The site's address: the configured domain, or the one requested. */
export function siteUrl(event: H3Event): string {
  const configured = useRuntimeConfig(event).public.siteUrl
  // Behind CloudFront the public address is in X-Forwarded-Host.
  const requested = getRequestURL(event, { xForwardedHost: true }).origin
  return (configured || requested).replace(/\/$/, '')
}
