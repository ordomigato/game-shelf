<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const notFound = computed(() => props.error.statusCode === 404)

function goHome() {
  void clearError({ redirect: '/' })
}
</script>

<template>
  <NuxtLayout>
    <section class="mx-auto max-w-xl py-16 text-center">
      <h1 class="text-4xl font-bold">
        {{ notFound ? 'Page not found' : 'Something went wrong' }}
      </h1>
      <p class="mt-4 text-muted-foreground">
        {{
          notFound
            ? 'This page is not on the shelf.'
            : 'Please try again in a moment.'
        }}
      </p>
      <Button class="mt-8" @click="goHome">Back to home</Button>
    </section>
  </NuxtLayout>
</template>
