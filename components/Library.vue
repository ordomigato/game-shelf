<template>
  <section id="library" class="bg-gray-100 h-screen library-section">
    <div class="container">
      <div id="my-collection" class="py-8">
        <h2 class="font-bold pb-2">My Collection</h2>
        <div class="flex flex-row flex-wrap">
          <div v-for="game in owned" :key="game.id" class="w-1/6 pr-2">
            <GameTile :game="game" />
          </div>
        </div>
      </div>
      <div id="my-wishlist" class="py-8">
        <h2 class="font-bold pb-2">My Wishlist</h2>
        <div class="flex flex-row flex-wrap">
          <div v-for="game in wishlist" :key="game.id" class="w-1/6 pr-2">
            <GameTile :game="game" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import { mapGetters } from 'vuex'
import GameTile from '~/components/GameTile.vue'

export default {
  data() {
    return {
      owned: [],
      wishlist: [],
    }
  },
  components: {
    GameTile,
  },
  mounted() {
    // get owned games and wishlist from user
    let user = this.$store.state.users.user
    let { owned_games, wishlist } = user
    let gamesArray = []
    if (owned_games && owned_games.length > 0) gamesArray = gamesArray.concat(owned_games)
    if (wishlist && wishlist.length > 0) gamesArray = gamesArray.concat(wishlist)
    if (gamesArray && gamesArray.length > 0) {
      // create a query string to target all games and pull
      let query = this.$fireStore.collection('games').where(this.$fireStoreObj.FieldPath.documentId(), 'in', gamesArray)
      query.get().then(games => {
        // sort if game is owned or in wishlist
        games.forEach(game => {
          let isOwned = owned_games.some(owned_game => owned_game == game.data().id)
          isOwned ? this.owned.push(game.data()) : this.wishlist.push(game.data())
        })
      })
    }
  },
  computed: {
    ...mapGetters({
      ownedGames: 'users/getOwnedGames',
      user: 'users/getUser',
    })
  },
}
</script>
<style scoped>
  .library-section {
    -webkit-box-shadow: 1px -1px 5px 1px rgba(0,0,0,0.05);
    -moz-box-shadow: 1px -1px 5px 1px rgba(0,0,0,0.05);
    box-shadow: 1px -1px 5px 1px rgba(0,0,0,0.05);
  }
  body {
    background-color: red;
  }
</style>