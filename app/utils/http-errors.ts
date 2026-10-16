/** Whether a failed request was answered with 404. */
export function isNotFound(error: unknown): boolean {
  const { statusCode, status } = (error ?? {}) as {
    statusCode?: number
    status?: number
  }
  return (statusCode ?? status) === 404
}
