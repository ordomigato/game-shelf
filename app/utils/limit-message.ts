/**
 * The message for a "plan limit reached" refusal from the server
 * (server/utils/limits.ts), or null for any other error.
 */
export function limitMessage(
  error: unknown,
  t: (key: string, params: Record<string, unknown>) => string,
): string | null {
  const data = (
    error as {
      data?: { data?: { key?: string; params?: Record<string, unknown> } }
    }
  )?.data?.data
  if (!data?.key?.startsWith('limits.reached.')) return null
  return t(data.key, data.params ?? {})
}
