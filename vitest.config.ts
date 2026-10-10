import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['{app,server,shared,i18n}/**/*.test.ts'],
    passWithNoTests: true,
  },
})
