/**
 * Downloads everything the user has: every collection, Wishlist included,
 * as CSV files in one zip.
 */
export default defineEventHandler(async (event) => {
  const { sub } = await requireAuth(event)
  const user = await findOrCreateUser(sub)
  // Cheap, but not free: a few exports per user every ten minutes.
  await rateLimit(event, `export:${user.id}`, { limit: 3, windowSeconds: 600 })
  const zip = await exportEverything(user.id)
  const date = new Date().toISOString().slice(0, 10)
  setResponseHeaders(event, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="gameshelf-${user.username ?? 'export'}-${date}.zip"`,
    'Cache-Control': 'no-store',
  })
  return zip
})
