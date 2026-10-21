import { isIndexable } from '../../shared/utils/seo'

/**
 * Only the production site (the one with a real domain set in
 * NUXT_PUBLIC_SITE_URL) may appear in search results. Every other stage
 * asks search engines to skip every page and follow no links.
 */
export default defineEventHandler((event) => {
  if (isIndexable(useRuntimeConfig(event).public.siteUrl)) return
  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
})
