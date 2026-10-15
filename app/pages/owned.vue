<script setup lang="ts">
/** Sends the signed-in user to their Owned list. */
definePageMeta({
  middleware: [
    'auth',
    async () => {
      if (import.meta.server) return
      const auth = useAuth()
      await auth.ensureLoaded()
      const username = auth.me.value?.username
      if (username) {
        return navigateTo(`/u/${username}/shelf/owned`, { replace: true })
      }
    },
  ],
})
</script>

<template>
  <div class="flex flex-col gap-4" aria-hidden="true">
    <Skeleton class="h-9 w-64" />
    <Skeleton class="h-5 w-96 max-w-full" />
  </div>
</template>
