<script setup lang="ts">
// A user's address on its own goes to their shelf.
definePageMeta({
  redirect: (to) =>
    `/u/${encodeURIComponent(String(to.params.username))}/shelf`,
})
</script>

<template>
  <div />
</template>
