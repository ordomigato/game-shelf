<template>
  <div class="w-full relative z-30">
    <div class="relative">
      <input class="hero-search-bar"spellcheck="false" placeholder="Search games" v-model="searchQuery" v-on:keyup.enter="search" />
      <button class="search-button" @click="search"><fa v-bind:class="{ active: searchQuery }" :icon="['fa', 'search']" /></button>
    </div>
    <div id="no-results-container" class="flex text-center mt-2" v-if="searchedGames.length === 0"></div>
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
      this.$store.commit('clearSearchQuery')
      this.$store.dispatch('searchForGame', this.searchQuery).then(() => {
        // handle if search query yields no results
        let searchedGames = this.$store.getters.getSearchedGames
        if (searchedGames.length === 0) {
          let noResultsContainer = document.getElementById('no-results-container')
          noResultsContainer.innerHTML = '<p class="font-medium">No results found =( &nbsp</p><p>Try changing your search words?</p>'
        }
      })
    },
  },
  computed: {
    ...mapGetters({
      searchedGames: 'getSearchedGames'
    })
  },
}
</script>

<style lang="scss" scoped>
.hero-search-bar {
  @apply px-8 py-4 text-2xl w-full text-white m-0 border-none shadow-md;
  background-color: rgba(61, 110, 148, 0.8);  
  &:hover {
    background-color: rgba(61, 110, 148, 0.9);  
  }
  &:focus {
    background-color: rgb(61, 110, 148);
    outline: none;
  }
}
.search-button {
  @apply px-8 h-full;
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  &:hover {
    background-color: rgba(61, 110, 148, 0.9);  
  }
  &:focus {
    outline: none;
  }
  svg {
    color: white;
    opacity: 0.6;
    &.active {
      opacity: 1; 
    }
  }
}
#no-results-container {
  @apply text-white;
}
</style>