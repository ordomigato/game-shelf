<template>
  <main>
    <Nav />
    <Profile />
    <Library />
  </main>
</template>

<script>
import * as firebase from 'firebase/app'
import 'firebase/auth'

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