import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['{app,server,shared}/**/*.test.ts'],
    passWithNoTests: true,
  },
})
