// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', 'shadcn-nuxt', '@nuxt/fonts', '@nuxtjs/color-mode'],
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/tailwind.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: {
    defaults: {
      weights: [400, 500, 600, 700],
    },
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
