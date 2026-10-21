<script setup lang="ts">
/** What ThisPlayShelf is and who makes it. Rendered on the server. */
const SITE = 'https://jeremygervais.ca'
const linkClass =
  'font-medium text-foreground underline underline-offset-4 hover:text-primary'

const { t } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('about.title') }) }))
useSeoMeta({
  description: () => t('seo.descriptions.about'),
  ogTitle: () => t('app.title', { page: t('about.title') }),
  ogDescription: () => t('seo.descriptions.about'),
})
</script>

<template>
  <article class="mx-auto flex max-w-2xl flex-col gap-8">
    <header class="flex flex-col gap-3">
      <h1 class="text-3xl font-bold">{{ $t('about.title') }}</h1>
      <p class="leading-relaxed text-muted-foreground">
        {{ $t('about.intro') }}
      </p>
    </header>

    <ProseSection :title="$t('about.whoTitle')">
      <i18n-t scope="global" keypath="about.who" tag="p">
        <template #name>
          <a :href="SITE" :class="linkClass" target="_blank" rel="noopener"
            >Jeremy Gervais</a
          >
        </template>
        <template #site>
          <a :href="SITE" :class="linkClass" target="_blank" rel="noopener"
            >jeremygervais.ca</a
          >
        </template>
      </i18n-t>
    </ProseSection>

    <ProseSection :title="$t('about.freeTitle')">
      <i18n-t scope="global" keypath="about.free" tag="p">
        <template #pricing>
          <NuxtLink to="/pricing" :class="linkClass">{{
            $t('about.pricingLink')
          }}</NuxtLink>
        </template>
      </i18n-t>
    </ProseSection>

    <ProseSection :title="$t('about.dataTitle')">
      <i18n-t scope="global" keypath="about.data" tag="p">
        <template #privacy>
          <NuxtLink to="/privacy" :class="linkClass">{{
            $t('about.privacyLink')
          }}</NuxtLink>
        </template>
      </i18n-t>
    </ProseSection>

    <ProseSection :title="$t('about.gamesTitle')">
      <i18n-t scope="global" keypath="about.games" tag="p">
        <template #igdb>
          <a
            href="https://www.igdb.com"
            :class="linkClass"
            target="_blank"
            rel="noopener"
            >IGDB</a
          >
        </template>
      </i18n-t>
    </ProseSection>

    <ProseSection :title="$t('about.contactTitle')">
      <i18n-t scope="global" keypath="about.contact" tag="p">
        <template #email><ContactLink /></template>
      </i18n-t>
    </ProseSection>
  </article>
</template>
