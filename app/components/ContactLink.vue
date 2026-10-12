<script setup lang="ts">
/** The contact address as a link, shown as text so it can be copied. */
</script>

<template>
  <a
    :href="`mailto:${CONTACT_EMAIL}`"
    class="font-medium text-foreground underline underline-offset-4 hover:text-primary"
    >{{ CONTACT_EMAIL }}</a
  >
</template>
