<template>
  <div>
    <Nav />
    <main class="nav-padding">
      <!-- makes sure onAuthStateChanged has got all the info before rendering. -->
      <Profile v-if="user && user.joined" />
      <!-- makes sure onAuthStateChanged has got all the info before rendering. -->
      <Library v-if="user && user.joined" />
    </main>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'

import Nav from '~/components/Nav.vue'
import Profile from '~/components/Profile.vue'
import Library from '~/components/Library.vue'

export default {
  components: {
    Nav,
    Profile,
    Library
  },
  computed: {
    ...mapGetters({
      user: 'users/getUser'
    })
  }
}
</script>

<style scoped></style>
