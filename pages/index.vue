<template>
  <div id="main-page">
    <Nav />
    <Hero />
    <div class="bg-gray-200">
      <div class="container mx-4">
        <main>
          <GameList
            v-if="games.length > 0 && searchedGames.length == 0"
            :games="games"
          />
          <GameResults v-if="searchedGames.length > 0" :games="searchedGames" />
        </main>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { mapGetters } from 'vuex'
import Nav from '~/components/Nav.vue'
import Hero from '~/components/Hero.vue'
import GameList from '~/components/GameList.vue'
import GameResults from '~/components/GameResults.vue'

export default Vue.extend({
  components: {
    Nav,
    Hero,
    GameList,
    GameResults
  },
  data() {
    return {
      games: []
    }
  },
  computed: {
    ...mapGetters({
      searchedGames: 'getSearchedGames'
    })
  }
  // mounted() {
  //   this.$store.dispatch('users/getLibrary')
  //   this.$store.dispatch('users/getWishlist')
  // },
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
