import { z } from 'zod'

const bodySchema = z.object({
  path: z.string().max(300),
  device: z.enum(['mobile', 'desktop']),
  metrics: z
    .array(
      z.object({
        name: z.enum(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']),
        // Milliseconds, except CLS, which is a small unitless score.
        value: z.number().min(0).max(120_000),
        rating: z.enum(['good', 'needs-improvement', 'poor']),
      }),
    )
    .min(1)
    .max(10),
})

/**
 * Logs Core Web Vitals sent by the browser (see the web-vitals plugin), one
 * `web.vital` line each, filed under the page's route pattern.
 */
export default defineEventHandler(async (event) => {
  const { path, device, metrics } = await readValidatedBody(
    event,
    bodySchema.parse,
  )
  const route = routeLabel(path)
  for (const metric of metrics) {
    log('info', 'web.vital', {
      name: metric.name,
      value:
        metric.name === 'CLS'
          ? Math.round(metric.value * 1000) / 1000
          : Math.round(metric.value),
      rating: metric.rating,
      route,
      device,
    })
  }
  setResponseStatus(event, 204)
  return null
})
