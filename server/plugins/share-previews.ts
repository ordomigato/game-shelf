import { log } from '../utils/log'

/**
 * Shared shelf and collection pages render in the browser, but link
 * previews (Discord, iMessage, Slack) only read the HTML the server sends.
 * So the server adds the preview tags to those pages' HTML.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', async (html, { event }) => {
    try {
      const preview = await findSharePreview(event.path)
      if (!preview) return
      const url = getRequestURL(event)
      html.head.push(...previewTags(preview, `${url.origin}${url.pathname}`))
    } catch (error) {
      // A missing preview is fine. The page itself still works.
      log('warn', 'preview.failed', {
        path: event.path.split('?')[0] ?? null,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })
})
