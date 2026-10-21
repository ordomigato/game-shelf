import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets parallel runs (one per agent) keep their own servers apart.
const port = Number(process.env.E2E_PORT ?? 3100)

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
    // is used. The region in the pool id decides the URL Amplify calls. Every
    // test shares one IP, so the server's request limits and origin check (no CloudFront here) are off.
    // The site address makes the server act as production (indexable, with
    // absolute links). Placeholder database and Twitch keys, and
    // e2e/support/fake-backends.mjs answering the server's calls to them and
    // IGDB, let pages that need the database or IGDB render on the server.
    command: `NITRO_PRESET=node-server npm run build && NODE_OPTIONS='--import ./e2e/support/fake-backends.mjs' SST_RESOURCES_JSON='{"DatabaseUrl":{"value":"postgres://e2e:e2e@e2e.neon.test/e2e"},"TwitchClientId":{"value":"e2e"},"TwitchClientSecret":{"value":"e2e"}}' NUXT_PUBLIC_SITE_URL=http://localhost:${port} NUXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_e2etest NUXT_PUBLIC_COGNITO_CLIENT_ID=e2etestclient NUXT_PUBLIC_COGNITO_DOMAIN=auth.e2e.test NUXT_RATE_LIMIT_ENABLED=false NUXT_ORIGIN_CHECK=false PORT=${port} node .output/server/index.mjs`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
