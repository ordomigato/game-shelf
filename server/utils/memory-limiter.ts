/**
 * Counts hits per key in server memory, in fixed windows. Each Lambda
 * instance has its own counts (at most 5 run at once, so a client can get
 * about 5 times a limit), and they never touch Postgres, so a refused
 * request can't wake the database. Use `rateLimit` (Postgres) instead for
 * rare, costly actions that need one exact count.
 *
 * Memory is bounded: past `maxKeys`, expired windows go first, then the
 * oldest, so a flood of distinct clients can't grow it without limit. The
 * cost is that a flood can reset an honest client's count, which only lets
 * that client through, never locks anyone out. Keys hit with `pinned` (the
 * few instance-wide ceilings) live apart and are never evicted, or a flood
 * of made-up clients would reset the very ceiling meant to stop it.
 */
export interface Verdict {
  allowed: boolean
  /** Seconds until the window resets (for Retry-After). */
  retryAfter: number
}

interface Entry {
  count: number
  resetAt: number
}

export function createMemoryLimiter({
  maxKeys = 10_000,
  now = Date.now,
}: { maxKeys?: number; now?: () => number } = {}) {
  // A Map iterates in insertion order. Windows are re-inserted when they
  // reset, so the first keys are always the oldest.
  const entries = new Map<string, Entry>()
  const pinnedEntries = new Map<string, Entry>()

  function makeRoom(time: number) {
    if (entries.size < maxKeys) return
    for (const [key, entry] of entries) {
      if (entry.resetAt <= time) entries.delete(key)
    }
    for (const key of entries.keys()) {
      if (entries.size < maxKeys) break
      entries.delete(key)
    }
  }

  return {
    /** Counts one hit on `key` and says whether it is within `limit`. */
    hit(key: string, limit: number, windowMs: number, pinned = false): Verdict {
      const time = now()
      const map = pinned ? pinnedEntries : entries
      let entry = map.get(key)
      if (!entry || entry.resetAt <= time) {
        map.delete(key)
        if (!pinned) makeRoom(time)
        entry = { count: 0, resetAt: time + windowMs }
        map.set(key, entry)
      }
      entry.count++
      return {
        allowed: entry.count <= limit,
        retryAfter: Math.max(1, Math.ceil((entry.resetAt - time) / 1000)),
      }
    },
    get size() {
      return entries.size
    },
  }
}

/** The one limiter every request in this Lambda instance shares. */
export const memoryLimiter = createMemoryLimiter()
