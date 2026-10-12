<script setup lang="ts">
/** The account's plan and how much of it is used. */
const { t } = useI18n()
useHead(() => ({
  title: t('app.title', { page: t('account.tabs.usage') }),
}))
</script>

<template>
  <PlanCard />
</template>
