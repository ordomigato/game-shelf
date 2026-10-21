/**
 * The sitemap search engines read (robots.txt points to it): every page
 * worth listing, built from the database. One file while it fits the 50,000
 * page limit. Past that, this becomes an index of `/sitemaps/<n>.xml`.
 * CloudFront keeps a copy for a few hours (`setSitemapHeaders`).
 */
export default defineEventHandler(async (event) => {
  const site = siteUrl(event)
  const chunks = chunkEntries(sitemapEntries(await loadSitemapData()))
  setSitemapHeaders(event)
  if (chunks.length === 1) return urlsetXml(chunks[0]!, site)
  return indexXml(chunks.map((_, index) => `${site}/sitemaps/${index + 1}.xml`))
})
