<template>
  <div id="hero" v-bind:style="{ backgroundImage: 'url(' + heroImage + ')' }" >
    <div class="container h-full">
      <div class="flex items-center h-full justify-center flex-col hero-inner-container">
        <h2 class="text-white pb-2 font-bold text-4xl">Catalogy Your Video Game Collection</h2>
        <SearchBar />
      </div>
    </div>
  </div>
</template>

<script>
import SearchBar from '~/components/SearchBar.vue'
import heroImage from '~/assets/images/hero-image.jpg'

export default {
  components: {
    SearchBar,
  },
  data() {
    return {
      heroImage: heroImage
    }
  }
}
</script>

<style lang="scss" scoped>
#hero {
  @apply bg-gray-700;
  height: 60vh;
  background-size: cover;
  background-position: 50% 50%;
  width: 100%;
  .hero-inner-container {
    max-width: 768px;
    margin: 0 auto;
  }
}
</style>