<template>
  <div>
    <Nav />
    <div class="container">
      <main>
        <GameList v-if="games.length > 0" :games="games" />
      </main>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import axios from 'axios'
import * as firebase from 'firebase/app'
import 'firebase/auth'

import Logo from '~/components/Logo.vue'
import Nav from '~/components/Nav.vue'
import GameList from '~/components/GameList.vue'

export default Vue.extend({
  components: {
    Logo,
    Nav,
    GameList,
  },
  data() {
    return {
      games: []
    }
  },
  // Get Popular Game Data
  asyncData () {
    return axios.get(`https://api-v3.igdb.com/games/?fields=name,cover.image_id,popularity&order=popularity:desc`)
      .then((res) => {
        return { games: res.data }
      })
      .catch((err) => {
        console.log(err);
      })
  },
})
</script>

<style>
/* Sample `apply` at-rules with Tailwind CSS
.container {
  @apply min-h-screen flex justify-center items-center text-center mx-auto;
}
*/
.container {
  display: block;
  margin: 0 auto;
}

.title {
  font-family: 'Quicksand', 'Source Sans Pro', -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  display: block;
  font-weight: 300;
  font-size: 100px;
  color: #35495e;
  letter-spacing: 1px;
}

.subtitle {
  font-weight: 300;
  font-size: 42px;
  color: #526488;
  word-spacing: 5px;
  padding-bottom: 15px;
}

.links {
  padding-top: 15px;
}
</style>
