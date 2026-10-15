// The module Nitro auto-imports `useEvent` from. Unlike 'nitropack/runtime'
// it pulls in none of Nitro's virtual modules, so scripts run with tsx
// outside Nitro can import the database and IGDB helpers.
import { useEvent } from 'nitropack/runtime/internal/context'

/** Time a request spent waiting on each outside service, and how often. */
export interface RequestTimings {
  db: { count: number; ms: number }
  igdb: { count: number; ms: number }
}

declare module 'h3' {
  interface H3EventContext {
    /** When the request started, from `performance.now()`. */
    requestStart?: number
    timings?: RequestTimings
  }
}

/**
 * Adds time spent on a database query or IGDB call to the current request,
 * for its log line. Found through Nitro's request context (the
 * `asyncContext` setting), so callers don't pass the request around.
 * Outside a request, like during start-up, it does nothing.
 */
export function recordTiming(kind: keyof RequestTimings, ms: number) {
  let timings: RequestTimings
  try {
    const event = useEvent()
    timings = event.context.timings ??= {
      db: { count: 0, ms: 0 },
      igdb: { count: 0, ms: 0 },
    }
  } catch {
    return
  }
  timings[kind].count += 1
  timings[kind].ms += ms
}
