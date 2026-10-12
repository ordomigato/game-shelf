<script setup lang="ts">
/** The copyright on the left; About, Privacy and Contact on the right. */
const year = new Date().getFullYear()
const linkClass = 'underline-offset-4 hover:text-foreground hover:underline'
</script>

<template>
  <footer class="border-t border-border py-6 text-sm text-muted-foreground">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 sm:px-6"
    >
      <p>{{ $t('footer.copyright', { year }) }}</p>
      <nav :aria-label="$t('footer.label')" class="flex gap-4">
        <NuxtLink to="/about" :class="linkClass">{{
          $t('footer.about')
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
