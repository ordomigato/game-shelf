<template>
  <div class="w-full relative">
    <input class="hero-search-bar" placeholder="Search games" v-model="searchQuery" />
    <button class="search-button" @click="search"><fa :icon="['fa', 'search']"  /></button>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'

export default {
  data() {
    return {
      searchQuery: '',
    }
  },
  methods: {
    search() {
      this.$store.dispatch('searchForGame', this.searchQuery)
    },
  }
}
</script>

<style lang="scss" scoped>
.hero-search-bar {
  @apply px-8 py-4 text-2xl w-full text-white;
  background-color: rgba(61, 110, 148, 0.8);  
}
.search-button {
  @apply pr-8;
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  svg {
    color: white;
  }
}
</style>