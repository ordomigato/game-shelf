import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

/**
 * Reports Core Web Vitals (how fast pages feel) from a sample of real
 * visits: LCP (main content shown), INP (response to taps and typing), CLS
 * (layout jumps), plus FCP and TTFB. They're sent once, when the page is
 * hidden or closed, to /api/vitals, which logs them. They describe the page
 * load, so they're filed under the page the visit started on. Nothing
 * about the person is sent.
 *
 * Setting `gameshelf:vitals` to `always` in localStorage reports every
 * visit, for checking it works.
 */
export default defineNuxtPlugin(() => {
  let always = false
  try {
    always = localStorage.getItem('gameshelf:vitals') === 'always'
  } catch {
    // Storage can be blocked. Then the sample decides.
  }
  const rate = Number(useRuntimeConfig().public.vitalsSampleRate)
  if (!always && !(Math.random() < rate)) return

  const path = window.location.pathname
  const device = window.matchMedia('(pointer: coarse)').matches
    ? 'mobile'
    : 'desktop'
  const queue: Metric[] = []

  function flush() {
    if (!queue.length || !navigator.sendBeacon) return
    const metrics = queue.splice(0).map(({ name, value, rating }) => ({
      name,
      value,
      rating,
    }))
    navigator.sendBeacon(
      '/api/vitals',
      new Blob([JSON.stringify({ path, device, metrics })], {
        type: 'application/json',
      }),
    )
  }

  const add = (metric: Metric) => queue.push(metric)
  onCLS(add)
  onFCP(add)
  onINP(add)
  onLCP(add)
  onTTFB(add)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
})
