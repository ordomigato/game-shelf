<template>
  <section class="bg-gray-100 h-screen library-section">
    <div class="container">
      <div id="my-collection" class="py-8">
        <h2 class="font-bold pb-2">My Collection</h2>
        <div class="flex flex-row flex-wrap">
          <div v-for="game in games" :key="game.id" class="w-1/6 pr-2">
            <GameTile :game="game" />
          </div>
        </div>
      </div>
      <div id="my-wishlist" class="py-8">
        <h2 class="font-bold pb-2">My Collection</h2>
        <div class="flex flex-row flex-wrap">
          <div v-for="game in games" :key="game.id" class="w-1/6 pr-2">
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
      games: []
    }
  },
  components: {
    GameTile,
  },
  mounted() {
    // get owned games and wishlist from user
    let userRef = this.$fireStore.collection('users').doc(this.user.uid) 
    userRef.get().then(doc => {
      if(doc.exists) {
        let ownedGamesArray = doc.data().owned_games
        // create a query string to target all the owned games
        let query = this.$fireStore.collection('games').where(this.$fireStoreObj.FieldPath.documentId(), 'in', ownedGamesArray)
        // pull data from games collection
        query.get().then(games => {
          games.forEach(game => {
            this.games.push(game.data())
          })
        })
      } else {
        console.log('Something went wrong retrieving library')
      }
    })
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