/**
 * The message key and values for a failed follow, unfollow or block, from
 * the server's answer. Numbers are shown with thousands separators, like
 * the limit messages elsewhere. Anything unexpected is the generic failure.
 */
export function followErrorMessage(
  error: unknown,
  locale = 'en',
): { key: string; params?: Record<string, string> } {
  const { statusCode, status, data } = (error ?? {}) as {
    statusCode?: number
    status?: number
    data?: { data?: { key?: string; params?: { limit?: number } } }
  }
  const code = statusCode ?? status
  const limit = data?.data?.params?.limit
  if (code === 403 && typeof limit === 'number') {
    const params = { limit: new Intl.NumberFormat(locale).format(limit) }
    return data?.data?.key === 'follows.blockLimitReached'
      ? { key: 'follows.blockLimitReached', params }
      : { key: 'follows.limitReached', params }
  }
  if (code === 409) return { key: 'follows.unblockFirst' }
  if (code === 429) return { key: 'follows.tooMany' }
  return { key: 'follows.failed' }
}
