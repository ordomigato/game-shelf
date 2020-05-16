<template>
  <div class="w-full relative">
    <input class="hero-search-bar" placeholder="Search games" v-model="searchQuery" v-on:keyup.enter="search" />
    <button class="search-button" @click="search"><fa v-bind:class="{ active: searchQuery }" :icon="['fa', 'search']"  /></button>
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
  @apply px-8 py-4 text-2xl w-full text-white m-0 border-none shadow-md;
  background-color: rgba(61, 110, 148, 0.8);  
  &:hover, &:focus {
    background-color: rgb(61, 110, 148);  
  }
}
.search-button {
  @apply px-8 h-full;
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  svg {
    color: white;
    opacity: 0.6;
    &.active {
      opacity: 1; 
    }
  }
}
</style>