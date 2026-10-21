import { test as base, expect } from '@playwright/test'

/** Addresses pages ask for in the background, when a test doesn't stub them. */
const BACKGROUND_CALLS = [
  '**/api/collections',
  '**/api/lists',
  '**/api/me/usage',
  '**/api/explore**',
  '**/api/u/*',
  '**/api/u/*/lists',
]

/**
 * Playwright `test` that fails any test whose page logs a Vue hydration
 * warning (the server render and the browser's first render differ) or
 * hits the Content-Security-Policy (something blocked from loading).
 *
 * It also answers the calls pages make in the background that a test
 * doesn't stub with a 404. Left alone they would reach the real routes,
 * which need a database and Cognito that E2E runs don't have, and fill the
 * server log with 500s, hiding any real one. A test's own stub for the same
 * address wins, since it is added later.
 */
export const test = base.extend<{ consoleGuard: undefined }>({
  page: async ({ page }, use) => {
    for (const pattern of BACKGROUND_CALLS) {
      await page.route(pattern, (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({
              status: 404,
              json: { statusMessage: 'Not stubbed by this test' },
            })
          : route.fallback(),
      )
    }
    await use(page)
  },
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = []
      page.on('console', (message) => {
        const text = message.text()
        if (/hydration|Content Security Policy/i.test(text)) {
          problems.push(text.split('\n')[0]!)
        }
      })
      await use(undefined)
      expect(problems, 'hydration or CSP problems').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
