// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'GameShelf',
    },
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
