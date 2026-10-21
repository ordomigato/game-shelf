import { parseSharePath } from '../../shared/utils/share-preview'
import { log } from '../utils/log'

/**
 * Shared shelf and collection pages render in the browser, but link
 * previews (Discord, iMessage, Slack) and search engines read the HTML the
 * server sends. So the server adds the canonical link, preview tags and
 * structured data to those pages' HTML. A page that is missing or private
 * asks to stay out of search results instead.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', async (html, { event }) => {
    try {
      const preview = await findSharePreview(event.path)
      if (!preview) {
        if (parseSharePath(event.path)) {
          html.head.push('<meta name="robots" content="noindex">')
        }
        return
      }
      const site = siteUrl(event)
      html.head.push(
        ...previewHead(preview, getRequestURL(event).pathname, site),
      )
    } catch (error) {
      // A missing preview is fine. The page itself still works.
      log('warn', 'preview.failed', {
        path: event.path.split('?')[0] ?? null,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })
})
