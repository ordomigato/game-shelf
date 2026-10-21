<script setup lang="ts">
const colorMode = useColorMode()
const { t } = useI18n()
const route = useRoute()
const site = useSiteUrl()

// Defaults for every page. Pages with something better to say (a game, a
// shared collection) set their own description, title and image.
useHead({
  link: [
    { rel: 'canonical', href: () => canonicalUrl(site.value, route.path) },
  ],
})
useSeoMeta({
  description: () => t('preview.site'),
  ogSiteName: 'ThisPlayShelf',
  ogType: 'website',
  ogUrl: () => `${site.value}${route.path}`,
  ogTitle: 'ThisPlayShelf',
  ogDescription: () => t('preview.site'),
  ogImage: () => `${site.value}/og.png`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: () => t('preview.imageAlt'),
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <TooltipProvider :delay-duration="150">
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <!-- Toasts for actions that fail after a click, like saving a value. -->
    <ClientOnly>
      <Toaster
        :theme="colorMode.value === 'dark' ? 'dark' : 'light'"
        position="bottom-right"
        close-button
      />
    </ClientOnly>
  </TooltipProvider>
</template>
