<template>
    <article :data-game-id="game.id">
      <div class="cover-container">
        <a href="#"><img :src="`//images.igdb.com/igdb/image/upload/t_cover_big_2x/${game.cover.image_id}.jpg`" alt="cover image" class="game-tile_cover-image" /></a>
        <button type="button" class="z-20 add-icon" v-on:click="addToOwned($event)">
          <fa :icon="['fa', 'plus']"  />
        </button>
        <!-- <button type="button" class="z-20 add-icon" v-on:click="removeFromOwned($event)">
          <fa :icon="['fa', 'minus']"  />
        </button> -->
      </div>
      <h3>{{ game.name }}</h3>
    </article>
</template>

<script>

export default {
  props: [
    'game'
  ],
  methods: {
    async addToOwned($event) {
      // grab game id
      let gameId = await event.currentTarget.parentElement.parentElement.getAttribute('data-game-id')
      // add game to firestore (using gameLibraryMixins.js custom plugin)
      this.$addGame(gameId)
    },
    // removeFromOwned($event) {

    // }
  }
}
</script>

<style scoped>

.cover-container {
  max-height: 335px;
  overflow: hidden;
  position: relative;
}
.game-tile_cover-image {
  object-fit: contain;
}

.add-icon {
  background-color: black;
  padding: 1rem;
  position: absolute;
  bottom: 0;
  right: 0;
}

.add-icon:hover {
  background-color: var(--secondary-color);
  cursor: pointer;
}

.add-icon svg {
  color: white;
  height: 1rem;
  width: 1rem;
}


</style>