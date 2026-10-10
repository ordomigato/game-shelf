import type { H3Event } from 'h3'
import { log } from '../utils/log'
import { routeLabel } from '../utils/route-label'

/** Build files and the browser's own reports, which aren't worth a line each. */
const SKIPPED = /^\/(_nuxt|__nuxt|_ipx|favicon|api\/vitals)/

// A Lambda instance's first request also paid for starting up.
let warm = false

const round = (ms: number) => Math.round(ms)

function timingsOf(event: H3Event) {
  const timings = event.context.timings
  return {
    dbQueries: timings?.db.count ?? 0,
    dbMs: round(timings?.db.ms ?? 0),
    igdbCalls: timings?.igdb.count ?? 0,
    igdbMs: round(timings?.igdb.ms ?? 0),
  }
}

/**
 * One `http.request` log line per request: the route pattern (never the
 * query string), status, duration, whether it was a cold start, and the
 * time spent on the database and IGDB. Responses also carry a standard
 * Server-Timing header with the same breakdown, which browser dev tools
 * show. See the observability skill for the queries that read these.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.requestStart = performance.now()
  })

  nitroApp.hooks.hook('beforeResponse', (event) => {
    const start = event.context.requestStart
    if (start === undefined || event.node.res.headersSent) return
    const { dbMs, igdbMs } = timingsOf(event)
    setResponseHeader(
      event,
      'Server-Timing',
      `total;dur=${round(performance.now() - start)}, db;dur=${dbMs}, igdb;dur=${igdbMs}`,
    )
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    const start = event.context.requestStart
    if (start === undefined || SKIPPED.test(event.path)) return
    const coldStart = !warm
    warm = true
    log('info', 'http.request', {
      method: event.method,
      route: routeLabel(event.path, event.context.matchedRoute?.path),
      status: event.node.res.statusCode,
      durationMs: round(performance.now() - start),
      coldStart,
      ...timingsOf(event),
    })
  })
})
