import { test as base, expect } from '@playwright/test'

/**
 * Playwright `test` that fails any test whose page logs a Vue hydration
 * warning, i.e. the server render and the browser's first render differ.
 */
export const test = base.extend<{ hydrationGuard: undefined }>({
  hydrationGuard: [
    async ({ page }, use) => {
      const warnings: string[] = []
      page.on('console', (message) => {
        if (/hydration/i.test(message.text())) warnings.push(message.text())
      })
      await use(undefined)
      expect(warnings, 'hydration warnings').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
