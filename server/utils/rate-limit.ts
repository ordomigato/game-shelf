import { sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { rateLimits } from '../db/schema'

/**
 * Allows `limit` uses of an action per `windowSeconds`, per key (like
 * `export:<user id>`). Counted in Postgres, so the limit holds across every
 * Lambda instance. The count and the window reset happen in one statement,
 * so two requests at once can't both slip through. Over the limit, it
 * throws a 429 with a Retry-After header.
 */
export async function rateLimit(
  event: H3Event,
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<void> {
  const windowMs = windowSeconds * 1000
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs)
  const [row] = await useDb()
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} = excluded.window_start
          then ${rateLimits.count} + 1 else 1 end`,
        windowStart: sql`excluded.window_start`,
      },
    })
    .returning({ count: rateLimits.count })
  if ((row?.count ?? 0) <= limit) return
  const retryAfter = Math.ceil(
    (windowStart.getTime() + windowMs - Date.now()) / 1000,
  )
  setResponseHeader(event, 'Retry-After', retryAfter)
  log('warn', 'rate_limited', { action: key.split(':')[0] ?? key })
  throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
}
