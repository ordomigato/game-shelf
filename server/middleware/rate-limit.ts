import { log } from '../utils/log'
import { memoryLimiter } from '../utils/memory-limiter'
import {
  LIMIT_WINDOW_MS,
  REQUEST_LIMITS,
  clientIp,
  isWrite,
  limitGroupFor,
} from '../utils/request-limits'

declare module 'h3' {
  interface H3EventContext {
    /** Set on changes, so `requireAuth` also counts them per signed-in user. */
    limitUserWrites?: boolean
  }
}

/**
 * Per-client request limits, counted in this Lambda instance's memory (see
 * memory-limiter.ts), so a script can't tie up the few Lambda instances,
 * burn the IGDB quota or flood the logs. Over a limit it answers 429 with
 * Retry-After before any route runs, so nothing reaches Postgres. The
 * performance beacon is dropped with 204 instead. Limits are in
 * `REQUEST_LIMITS`. Switch off with NUXT_RATE_LIMIT_ENABLED=false (the e2e
 * server does).
 */
export default defineEventHandler((event) => {
  if (!useRuntimeConfig(event).rateLimitEnabled) return
  const group = limitGroupFor(
    event.method,
    event.path,
    !!getHeader(event, 'authorization'),
  )
  if (!group) return
  if (isWrite(event.method, event.path)) event.context.limitUserWrites = true
  const ip = clientIp(event)
  if (!ip) return

  const { perClient, perInstance } = REQUEST_LIMITS[group]
  const client = memoryLimiter.hit(`${group}:${ip}`, perClient, LIMIT_WINDOW_MS)
  // Refused requests don't count toward the instance-wide ceiling, so one
  // noisy client can't use it up for everyone else.
  const everyone = client.allowed
    ? memoryLimiter.hit(group, perInstance, LIMIT_WINDOW_MS)
    : client
  if (everyone.allowed) return

  log('warn', 'http.rate_limited', { group })
  if (group === 'vitals') return sendNoContent(event)
  setResponseHeader(event, 'Retry-After', everyone.retryAfter)
  throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
})
