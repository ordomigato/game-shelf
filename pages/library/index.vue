<template>
  <div>
    <Nav />
    <main class="nav-padding">
      <Profile />
      <Library />
    </main>
  </div>
</template>

<script>

import Nav from '~/components/Nav.vue'
import Profile from '~/components/Profile.vue'
import Library from '~/components/Library.vue'

export default {
  components: {
    Nav,
    Profile,
    Library
  },
}
</script>

<style scoped>
</style>