<template>
  <div id="hero" class="relative" v-bind:class="{ 'h-60': searchedGames.length > 0 }">
    <div class="hero-background">
      <div class="hero-background__filter z-20"></div>
      <div class="hero-background__image" lazy-background="~/assets/images/hero-image.jpg"></div>
      <div class="hero-background__overlay z-20"></div>
    </div>
    <div class="container h-full">
      <div class="flex items-center h-full justify-center flex-col hero-inner-container px-4">
        <h2 class="text-white pb-2 font-bold text-4xl z-30">Catalog Your Video Game Collection</h2>
        <SearchBar />
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'

import SearchBar from '~/components/SearchBar.vue'

export default {
  components: {
    SearchBar,
  },
  computed: {
    ...mapGetters({
      searchedGames: 'getSearchedGames'
    })
  },
}
</script>

<style lang="scss" scoped>
#hero {
  background-color: #120e1e;
  height: 100vh;
  width: 100%;
  &.h-60 {
    height: 60vh;
    transition: height 1s ease-in-out; 
  }
  .hero-background__filter {
    position: absolute;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
  }
  .hero-background {
    position: absolute;
    width: 100%;
    height: 100%;
    .hero-background__image {
      position: absolute;
      width: 100%;
      height: 100%;
      background-size: cover;
      background-position: 50% 50%;
      transform: translateX(-20%);
      transition: transform 1.5s ease-in-out;
      &.lazyLoad {
        transform: translateX(0%);
        transition: transform 1.5s ease-in-out 0.5s;
        & ~ .hero-background__overlay {
          transition: transform 1.5s ease-in-out 0.5s;
          transform-origin: center right;
          transform: scaleX(0);
        }
      }
    }
    .hero-background__overlay {
      position: absolute;
      background-color: #120e1e;
      width: 100%;
      height: 100%;
    }
  }

  .hero-inner-container {
    max-width: 768px;
    margin: 0 auto;
  }
}
</style>