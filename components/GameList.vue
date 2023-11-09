<template>
  <section>
    <h2 class="text-xl font-medium py-2">Popular Games</h2>
    <client-only>
      <swiper class="swiper" :options="swiperOption">
        <swiper-slide v-for="game in games" :key="game.id">
          <GameTile :game="game" />
        </swiper-slide>
        <div slot="button-prev" class="swiper-button-prev"></div>
        <div slot="button-next" class="swiper-button-next"></div>
      </swiper>
    </client-only>
  </section>
</template>

<script>
import GameTile from '~/components/GameTile.vue'

export default {
  components: {
    GameTile
  },
  props: ['games'],
  data() {
    return {
      swiperOption: {
        slidesPerView: 5,
        spaceBetween: 5,
        slidesPerGroup: 1,
        navigation: {
          nextEl: '.swiper-button-next',
          prevEl: '.swiper-button-prev'
        }
      }
    }
  }
}
</script>

<style scoped>
.game-list__container {
  overflow: hidden;
}

.swiper-button-next,
.swiper-button-prev {
  color: white;
  background-color: rgba(0, 0, 0, 0.8);
  width: 3rem;
  padding: 4rem 0;
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
