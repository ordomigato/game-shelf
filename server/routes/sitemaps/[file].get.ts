import { z } from 'zod'

// The route matches a whole segment, so the `.xml` is part of the name.
const paramsSchema = z.object({
  file: z
    .string()
    .regex(/^[1-9]\d{0,5}\.xml$/)
    .transform((name) => Number.parseInt(name, 10)),
})

/** One file of a sitemap too big for one (see `/sitemap.xml`). */
export default defineEventHandler(async (event) => {
  const bare = bareSitemapPath(event)
  if (bare) return sendRedirect(event, bare, 301)
  const { file: n } = await getValidatedRouterParams(event, paramsSchema.parse)
  const chunk = chunkEntries(sitemapEntries(await loadSitemapData()))[n - 1]
  if (!chunk) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setSitemapHeaders(event)
  return urlsetXml(chunk, siteUrl(event))
})
