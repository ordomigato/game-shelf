// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

const noindex = { 'X-Robots-Tag': 'noindex' }

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    'shadcn-nuxt',
    '@nuxt/fonts',
    '@nuxtjs/color-mode',
    '@nuxtjs/i18n',
  ],
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/tailwind.css', 'vue-sonner/style.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: {
    defaults: {
      weights: [400, 500, 600, 700],
    },
  },
  // English only for now. Adding a language means adding a file under
  // i18n/locales and an entry here. URLs stay unprefixed.
  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
    detectBrowserLanguage: false,
  },
  colorMode: {
    classSuffix: '',
  },
  shadcn: {
    prefix: '',
    componentDir: '@/components/ui',
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'ThisPlayShelf',
      // The SVG favicon follows the browser's light or dark mode. The .ico
      // is for browsers without SVG favicons; the PNG is the phone icon.
      link: [
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [{ name: 'theme-color', content: '#041429' }],
    },
  },
  // Pages that depend on who is signed in render in the browser only. The
  // server can't know the user, so rendering them there would only produce
  // a page the browser then has to replace.
  // Pages only for signing in or for your own account are kept out of
  // search results (noindex).
  routeRules: {
    '/account': { ssr: false, headers: noindex },
    '/account/**': { ssr: false, headers: noindex },
    '/welcome': { ssr: false, headers: noindex },
    '/owned': { ssr: false, headers: noindex },
    '/login': { ssr: false, headers: noindex },
    '/auth/**': { ssr: false, headers: noindex },
    '/signup': { ssr: false, headers: noindex },
    '/verify': { ssr: false, headers: noindex },
    '/forgot-password': { ssr: false, headers: noindex },
    // Rendered in the browser until public shelves get server rendering.
    '/u/**': { ssr: false },
  },
  runtimeConfig: {
    // Per-client request limits (server/middleware/rate-limit.ts). The e2e
    // server turns them off with NUXT_RATE_LIMIT_ENABLED=false.
    rateLimitEnabled: true,
    public: {
      // The real domain, for canonical links and link previews. Set in
      // production with NUXT_PUBLIC_SITE_URL.
      siteUrl: '',
      // The release tag, set by the deploy (NUXT_PUBLIC_APP_VERSION).
      appVersion: 'dev',
      cognitoUserPoolId: '',
      cognitoClientId: '',
      // Cognito's sign-in pages, for social logins (no https://).
      cognitoDomain: '',
      // Share of visits that report Core Web Vitals (0 to 1). Set with
      // NUXT_PUBLIC_VITALS_SAMPLE_RATE.
      vitalsSampleRate: 0.25,
    },
  },
  nitro: {
    // E2E tests build with NITRO_PRESET=node-server so they can run locally.
    preset: process.env.NITRO_PRESET ?? 'aws-lambda',
    // Lets server code find the current request (useEvent), so database and
    // IGDB time can be added to the request's log line.
    experimental: { asyncContext: true },
    // Bundles dependencies into a few chunks instead of ~1,700 files in
    // node_modules: loading them was most of the ~6 s Lambda cold start.
    // Production builds only: the dev server's own packages have optional
    // dependencies that can't be bundled.
    noExternals: process.env.NODE_ENV === 'production',
    typescript: {
      tsConfig: {
        include: ['../sst-env.d.ts'],
      },
    },
  },
  typescript: {
    tsConfig: {
      // Typecheck fails on a component the template uses but nobody
      // imported, which Vue otherwise only warns about in the browser.
      vueCompilerOptions: { checkUnknownComponents: true },
    },
  },
  eslint: {
    config: {
      typescript: { strict: true },
    },
  },
})
