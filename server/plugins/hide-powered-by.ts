/**
 * Nuxt announces itself in an X-Powered-By header. Nobody needs to know.
 * Removed just before the response goes out, after both of Nuxt's
 * renderers (plain and streaming) have set it.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    event.node.res.removeHeader('x-powered-by')
    const headers = (response as { headers?: Record<string, unknown> }).headers
    if (headers) delete headers['x-powered-by']
  })
})
