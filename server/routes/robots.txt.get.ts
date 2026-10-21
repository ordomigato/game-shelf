import { isIndexable } from '../../shared/utils/seo'

/**
 * Production lets crawlers in (except the API) and points them to the
 * sitemap. Any other stage turns them all away.
 */
export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  })
  if (!isIndexable(useRuntimeConfig(event).public.siteUrl)) {
    return 'User-agent: *\nDisallow: /\n'
  }
  return `User-agent: *\nDisallow: /api/\n\nSitemap: ${siteUrl(event)}/sitemap.xml\n`
})
