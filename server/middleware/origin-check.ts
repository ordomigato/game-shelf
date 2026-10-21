import { originAllowed } from '../utils/origin-check'

declare module 'h3' {
  interface H3EventContext {
    /** Set when the origin check turned the request away (not logged). */
    originRefused?: boolean
  }
}

/**
 * Only CloudFront may reach the server. The Lambda URL is public, so
 * CloudFront's viewer-request function adds a secret header
 * (`x-origin-secret`, see sst.config.ts) and anything without it gets a
 * bare 403 before anything else runs: no rate limit counts, no database,
 * no log line. This also makes `x-viewer-ip` trustworthy, because the same
 * function sets it.
 *
 * It runs on deployed stages only. `nuxt dev` (including `sst dev`, which
 * has no CloudFront) is skipped by `import.meta.dev`, and a built server
 * run locally or in e2e turns it off with NUXT_ORIGIN_CHECK=false. Every
 * other case is checked, and a deployed server with no secret configured
 * refuses everything rather than allowing everything.
 */
export default defineEventHandler((event) => {
  if (import.meta.dev) return
  const config = useRuntimeConfig(event)
  if (!config.originCheck) return
  if (originAllowed(config.originSecret, getHeader(event, 'x-origin-secret'))) {
    return
  }
  event.context.originRefused = true
  setResponseStatus(event, 403)
  return ''
})
