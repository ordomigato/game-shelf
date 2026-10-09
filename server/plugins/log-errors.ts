import type { H3Error } from 'h3'
import { log } from '../utils/log'

/**
 * Logs unexpected server errors: ones no code raised on purpose (h3 marks
 * them `unhandled`). Deliberate errors, like a 404 for a missing game or an
 * IGDB failure that `igdb.ts` already logged, are left out. The query string
 * is dropped from the path because it can hold search text.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    if (!(error as Partial<H3Error>).unhandled) return
    log('error', 'server.error', {
      statusCode: (error as Partial<H3Error>).statusCode ?? 500,
      path: event?.path.split('?')[0] ?? null,
      message: error.message,
    })
  })
})
