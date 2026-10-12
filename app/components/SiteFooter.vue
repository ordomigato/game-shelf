<script setup lang="ts">
/**
 * The copyright and release on the left; About, Privacy and Contact on the
 * right. Stacked and centred on phones.
 */
const year = new Date().getFullYear()
const version = useRuntimeConfig().public.appVersion
const linkClass = 'underline-offset-4 hover:text-foreground hover:underline'
</script>

<template>
  <footer class="border-t border-border py-5 text-xs text-muted-foreground">
    <div
      class="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left"
    >
      <p>
        {{ $t('footer.copyright', { year }) }}
        <span
          class="ml-2 font-mono text-[0.625rem] opacity-70"
          :title="$t('footer.version')"
          >{{ version }}</span
        >
      </p>
      <nav :aria-label="$t('footer.label')" class="flex gap-4">
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
    </div>
  </footer>
</template>
