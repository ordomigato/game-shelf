<template>
  <div id="hero" class="relative" >
    <div class="hero-background" lazy-background="~/assets/images/hero-image.jpg">
      <div class="hero-background__overlay z-20"></div>
    </div>
    <div class="container h-full">
      <div class="flex items-center h-full justify-center flex-col hero-inner-container px-4">
        <h2 class="text-white pb-2 font-bold text-4xl z-20">Catalog Your Video Game Collection</h2>
        <SearchBar />
      </div>
    </div>
  </div>
</template>

<script>
import SearchBar from '~/components/SearchBar.vue'

export default {
  components: {
    SearchBar,
  },
}
</script>

<style lang="scss" scoped>
#hero {
  background-color: #120e1e;
  height: 60vh;
  width: 100%;
  .hero-background {
    position: absolute;
    background-size: cover;
    background-position: 50% 50%;
    width: 100%;
    height: 100%;
    transform: translateX(-20%);
    transition: transform 1.5s ease-in-out;
    &.lazyLoad {
      transform: translateX(0%);
      transition: transform 1.5s ease-in-out;
      .hero-background__overlay {
        transform: scaleX(0);
        transform-origin: right center;
        transition: transform 1.5s ease-in-out;
      }
    }
  }
  .hero-background__overlay {
    @apply h-full;
    width: 101%;
    background-color: #120e1e;
  }
  .hero-inner-container {
    max-width: 768px;
    margin: 0 auto;
  }
}
</style>