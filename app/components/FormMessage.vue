<script setup lang="ts">
import { CircleAlert, CircleCheck } from '@lucide/vue'

defineProps<{ tone?: 'error' | 'success' }>()
</script>

<template>
  <Alert
    :variant="tone === 'success' ? 'default' : 'destructive'"
    :role="tone === 'success' ? 'status' : 'alert'"
  >
    <CircleCheck v-if="tone === 'success'" />
    <CircleAlert v-else />
    <AlertDescription><slot /></AlertDescription>
  </Alert>
</template>
