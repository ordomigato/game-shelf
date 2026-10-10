// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

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
      title: 'GameShelf',
    },
  },
  // Pages that depend on who is signed in render in the browser only. The
  // server can't know the user, so rendering them there would only produce
  // a page the browser then has to replace.
  routeRules: {
    '/account': { ssr: false },
    '/account/**': { ssr: false },
    '/welcome': { ssr: false },
    '/login': { ssr: false },
    '/signup': { ssr: false },
    '/verify': { ssr: false },
    '/forgot-password': { ssr: false },
    // Rendered in the browser until public shelves get server rendering.
    '/u/**': { ssr: false },
  },
  runtimeConfig: {
    public: {
      cognitoUserPoolId: '',
      cognitoClientId: '',
    },
  },
  nitro: {
    // E2E tests build with NITRO_PRESET=node-server so they can run locally.
    preset: process.env.NITRO_PRESET ?? 'aws-lambda',
    typescript: {
      tsConfig: {
        include: ['../sst-env.d.ts'],
      },
    },
  },
  eslint: {
    config: {
      typescript: { strict: true },
    },
  },
})
