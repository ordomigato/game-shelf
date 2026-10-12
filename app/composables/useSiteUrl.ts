/**
 * The site's address for links other sites read (canonical, link previews).
 * Production sets it (NUXT_PUBLIC_SITE_URL), so these always name the real
 * domain. Elsewhere it's the address the page was opened at.
 */
export function useSiteUrl() {
  const configured = useRuntimeConfig().public.siteUrl
  // Behind CloudFront the server sees its own address; the public one is
  // in X-Forwarded-Host.
  const origin = useRequestURL({ xForwardedHost: true }).origin
  return computed(() => (configured || origin).replace(/\/$/, ''))
}
