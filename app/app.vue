<script setup lang="ts">
const colorMode = useColorMode()
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
