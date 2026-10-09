export type LogLevel = 'info' | 'warn' | 'error'

export type LogFields = Record<string, string | number | boolean | null>

/**
 * Writes one JSON line per event, which CloudWatch Logs stores as-is on AWS
 * and `sst dev` prints locally. `event` is a dotted name like
 * `igdb.rate_limited`. Never pass secrets, tokens or user-entered text.
 */
export function log(level: LogLevel, event: string, fields: LogFields = {}) {
  const line = JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    ...fields,
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
