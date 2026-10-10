import { defineConfig, devices } from '@playwright/test'

const port = 3100

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Placeholder Cognito ids: tests stub Cognito's API, so no real pool
    // is used. The region in the pool id decides the URL Amplify calls.
    command: `NITRO_PRESET=node-server npm run build && NUXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_e2etest NUXT_PUBLIC_COGNITO_CLIENT_ID=e2etestclient PORT=${port} node .output/server/index.mjs`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
