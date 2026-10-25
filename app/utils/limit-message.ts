/**
 * The message for a "plan limit reached" refusal from the server
 * (server/utils/limits.ts), or null for any other error. Numbers in the
 * refusal are shown with thousands separators ("1,000 games"), like the
 * counts elsewhere in the app.
 */
export function limitMessage(
  error: unknown,
  t: (key: string, params: Record<string, unknown>) => string,
  locale = 'en',
): string | null {
  const data = (
    error as {
      data?: { data?: { key?: string; params?: Record<string, unknown> } }
    }
  )?.data?.data
  if (!data?.key?.startsWith('limits.reached.')) return null
  const format = new Intl.NumberFormat(locale)
  const params = Object.fromEntries(
    Object.entries(data.params ?? {}).map(([name, value]) => [
      name,
      typeof value === 'number' ? format.format(value) : value,
    ]),
  )
  return t(data.key, params)
}
