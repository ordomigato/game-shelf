import { expect, test } from './fixtures'

test('responses say where the server spent its time', async ({ request }) => {
  const response = await request.get('/')
  expect(response.headers()['server-timing']).toMatch(
    /^total;dur=\d+, db;dur=\d+, igdb;dur=\d+$/,
  )
})

test('pages report Core Web Vitals when the visit ends', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('gameshelf:vitals', 'always'),
  )
  const reports: {
    path: string
    device: string
    metrics: { name: string }[]
  }[] = []
  await page.route('**/api/vitals', (route) => {
    reports.push(route.request().postDataJSON())
    return route.fulfill({ status: 204 })
  })
  await page.goto('/?q=secret')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForFunction(
    () => '__vue_app__' in (document.querySelector('#__nuxt') ?? {}),
  )
  // Leaving the page (or switching tabs) sends the report.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await expect.poll(() => reports.length).toBe(1)
  // The query string, which can hold search text, isn't sent.
  expect(reports[0]!.path).toBe('/')
  expect(reports[0]!.device).toBe('desktop')
  expect(reports[0]!.metrics.map((metric) => metric.name)).toEqual(
    expect.arrayContaining(['FCP', 'TTFB']),
  )
})

test('a visit outside the sample sends nothing', async ({ page }) => {
  let sent = 0
  await page.route('**/api/vitals', (route) => {
    sent++
    return route.fulfill({ status: 204 })
  })
  // The default sample is 25%: a draw of 0.9 falls outside it.
  await page.addInitScript(() => {
    Math.random = () => 0.9
  })
  await page.goto('/')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(300)
  expect(sent).toBe(0)
})
