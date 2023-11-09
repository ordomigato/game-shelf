<template>
  <section class="px-4">
    <h2 class="text-xl font-medium pt-2">Search Results</h2>
    <p class="pb-2">Displaying {{ games.length }} matches</p>
    <div class="search-results flex flex-wrap">
      <div
        v-for="game in games"
        :key="game.id"
        class="w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5"
      >
        <GameTile :game="game" />
      </div>
    </div>
  </section>
</template>

<script>
import GameTile from '~/components/GameTile.vue'

export default {
  components: {
    GameTile
  },
  props: ['games']
}
</script>

<style lang="scss" scoped>
.search-results {
  margin-right: -5px !important;
}
</style>
