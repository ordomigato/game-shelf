<script setup lang="ts">
/**
 * The IGDB credit on the left (their terms ask for attribution), the
 * copyright and release in the middle, and About, Pricing, Privacy and
 * Contact on the right. On phones they stack and centre: links first, then
 * the credit, then the copyright and release.
 */
const year = new Date().getFullYear()
const version = useRuntimeConfig().public.appVersion
const linkClass = 'underline-offset-4 hover:text-foreground hover:underline'
</script>

<template>
  <footer class="border-t border-border py-5 text-xs text-muted-foreground">
    <div
      class="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 text-center sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-6 sm:px-6"
    >
      <nav
        :aria-label="$t('footer.label')"
        class="flex gap-4 sm:order-3 sm:justify-self-end"
      >
        <NuxtLink to="/about" :class="linkClass">{{
          $t('footer.about')
        }}</NuxtLink>
        <NuxtLink to="/pricing" :class="linkClass">{{
          $t('footer.pricing')
        }}</NuxtLink>
        <NuxtLink to="/privacy" :class="linkClass">{{
          $t('footer.privacy')
        }}</NuxtLink>
        <NuxtLink to="/contact" :class="linkClass">{{
          $t('footer.contact')
        }}</NuxtLink>
      </nav>
      <i18n-t
        scope="global"
        keypath="footer.igdbCredit"
        tag="p"
        class="sm:order-1 sm:justify-self-start sm:text-left"
      >
        <template #igdb>
          <a
            href="https://www.igdb.com"
            :class="linkClass"
            class="underline"
            target="_blank"
            rel="noopener"
            >IGDB</a
          >
        </template>
      </i18n-t>
      <p class="sm:order-2">
        {{ $t('footer.copyright', { year }) }}
        <span
          class="ml-2 font-mono text-[0.625rem] opacity-70"
          :title="$t('footer.version')"
          >{{ version }}</span
        >
      </p>
    </div>
  </footer>
</template>
