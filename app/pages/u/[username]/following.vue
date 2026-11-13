<script setup lang="ts">
const route = useRoute()
const username = computed(() => String(route.params.username).toLowerCase())
</script>

<template>
  <FollowList :username="username" kind="following" />
</template>
