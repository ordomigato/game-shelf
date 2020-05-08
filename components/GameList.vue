<template>
  <section>
    <h2 class="text-xl font-medium py-2">Popular Games</h2>
    <client-only>
      <swiper class="swiper" :options="swiperOption">
        <swiper-slide v-for="game in games" :key="game.id">
            <GameTile :game="game" />
        </swiper-slide>
        <div class="swiper-button-prev" slot="button-prev"></div>
        <div class="swiper-button-next" slot="button-next"></div>
      </swiper>
    </client-only>
  </section>
</template>

<script>
import GameTile from '~/components/GameTile.vue'
import { mapGetters } from 'vuex'

export default {
  mounted() {
    let user = this.$store.getters['users/getUser']
    if (user) {
      let loadedGames = this.games
      let ownedGamesArray = this.$store.getters['users/getOwnedGames']
      console.log(loadedGames)
      console.log(ownedGamesArray)
    }
  },
  data() {
    return {
      swiperOption: {
        slidesPerView: 5,
        spaceBetween: 5,
        slidesPerGroup: 1,
        loop: true,
        navigation: {
          nextEl: '.swiper-button-next',
          prevEl: '.swiper-button-prev'
        }
      }
    }
  },
  components: {
    GameTile
  },
  props: [
    'games',
  ],
}
</script>

<style scoped>
.game-list__container {
  overflow: hidden;
}

.swiper-button-next, 
.swiper-button-prev {
color: white;
background-color: rgba(0, 0, 0, 0.80);
padding: 4rem 2rem;
transform: translateY(-50%);
font-size: 2rem;
}
.swiper-button-next:hover, 
.swiper-button-prev:hover {
  background-color: var(--secondary-color);
  transition: background-color 0.2s ease-out;
}

.swiper-button-next:after, 
.swiper-button-prev:after {
  font-size: 1rem;
  font-weight: 900;
}

.swiper-button-prev {
  left: 0px;
}
.swiper-button-next {
  right: 0px;
}
</style>
