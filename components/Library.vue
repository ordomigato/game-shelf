<template>
  <section id="library" class="bg-gray-100 h-full library-section px-4">
    <div class="container">
      <div id="my-collection" class="py-8">
        <h2 class="font-bold pb-2">My Collection</h2>
        <div class="flex flex-wrap library_games">
          <div :v-if="owned.length > 0" v-for="game in owned" :key="game.id" class="w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5">
            <GameTile 
              :game="{
                id: game.id,
                name: game.title,
                image_id: game.image_url
              }"
            />
          </div>
        </div>
      </div>
      <div id="my-wishlist" class="py-8">
        <h2 class="font-bold pb-2">My Wishlist</h2>
        <div class="flex flex-row flex-wrap wishlist_games">
          <div :v-if="wishlist.length > 0" v-for="game in wishlist" :key="game.id" class="w-1/3 md:w-1/4 lg:w-1/5 xl:w-1/6">
              <GameTile 
              :game="{
                id: game.id,
                name: game.title,
                image_id: game.image_url
              }"
            />
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
  components: {
    GameTile,
  },
  computed: {
    ...mapGetters({
      owned: 'users/getOwnedGamesObjArray',
      wishlist: 'users/getWishlistGamesObjArray',
      user: 'users/getUser',
    })
  },
}
</script>
<style lang="scss" scoped>
  .library-section {
    -webkit-box-shadow: 1px -1px 5px 1px rgba(0,0,0,0.05);
    -moz-box-shadow: 1px -1px 5px 1px rgba(0,0,0,0.05);
    box-shadow: 1px -1px 5px 1px rgba(0,0,0,0.05);
    .library_games {
      margin-right: -3px !important;
    }
  }
  body {
    background-color: red;
  }
</style>