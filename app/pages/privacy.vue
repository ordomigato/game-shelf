<script setup lang="ts">
/** What's stored, where, and how to take it or delete it. */
const { t } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('privacy.title') }) }))
useSeoMeta({
  description: () => t('seo.descriptions.privacy'),
  ogTitle: () => t('app.title', { page: t('privacy.title') }),
  ogDescription: () => t('seo.descriptions.privacy'),
})

const linkClass =
  'font-medium text-foreground underline underline-offset-4 hover:text-primary'
</script>

<template>
  <article class="mx-auto flex max-w-2xl flex-col gap-8">
    <header class="flex flex-col gap-3">
      <h1 class="text-3xl font-bold">{{ $t('privacy.title') }}</h1>
      <p class="leading-relaxed text-muted-foreground">
        {{ $t('privacy.intro') }}
      </p>
    </header>

    <ProseSection :title="$t('privacy.accountTitle')">
      <p>{{ $t('privacy.account') }}</p>
    </ProseSection>

    <ProseSection :title="$t('privacy.storedTitle')">
      <p>{{ $t('privacy.stored') }}</p>
    </ProseSection>

    <ProseSection :title="$t('privacy.visibleTitle')">
      <p>{{ $t('privacy.visible') }}</p>
    </ProseSection>

    <ProseSection :title="$t('privacy.cookiesTitle')">
      <p>{{ $t('privacy.cookies') }}</p>
    </ProseSection>

    <ProseSection :title="$t('privacy.speedTitle')">
      <p>{{ $t('privacy.speed') }}</p>
    </ProseSection>

    <ProseSection :title="$t('privacy.othersTitle')">
      <p>{{ $t('privacy.others') }}</p>
    </ProseSection>

    <ProseSection :title="$t('privacy.controlTitle')">
      <i18n-t scope="global" keypath="privacy.control" tag="p">
        <template #settings>
          <NuxtLink to="/account/settings" :class="linkClass">{{
            $t('privacy.settingsLink')
          }}</NuxtLink>
        </template>
      </i18n-t>
    </ProseSection>

    <ProseSection :title="$t('privacy.questionsTitle')">
      <i18n-t scope="global" keypath="privacy.questions" tag="p">
        <template #email><ContactLink /></template>
      </i18n-t>
    </ProseSection>

    <p class="text-sm text-muted-foreground">{{ $t('privacy.updated') }}</p>
  </article>
</template>
