/** True when a database error is a unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, '23505')
}

/** True when a database error is a foreign-key violation. */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasCode(error, '23503')
}

function hasCode(error: unknown, code: string): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current; depth++) {
    if ((current as { code?: unknown }).code === code) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
