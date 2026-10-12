/**
 * Sends www.thisplayshelf.com to thisplayshelf.com, keeping the path, so
 * there's one address for links and search engines. CloudFront serves both
 * names; the public host is in X-Forwarded-Host.
 */
export default defineEventHandler((event) => {
  const host = getRequestHost(event, { xForwardedHost: true })
  if (!host.startsWith('www.')) return
  return sendRedirect(event, `https://${host.slice(4)}${event.path}`, 301)
})
