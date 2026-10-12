import { test as base, expect } from '@playwright/test'

/**
 * Playwright `test` that fails any test whose page logs a Vue hydration
 * warning (the server render and the browser's first render differ) or
 * hits the Content-Security-Policy (something blocked from loading).
 */
export const test = base.extend<{ consoleGuard: undefined }>({
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
