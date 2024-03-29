<template>
  <article
    class="single-game"
    :data-game-id="gameId"
    :class="{ owned: isOwned }"
  >
    <div class="shadow-md">
      <div class="cover-container">
        <img
          :src="
            `//images.igdb.com/igdb/image/upload/t_cover_big_2x/${gameImageId}.jpg`
          "
          alt="cover image"
          class="game-tile_cover-image"
        />
        <div class="single-game__tag flex items-center">
          <p v-if="isOwned" class="px-4">Owned</p>
          <p v-if="isInWishlist" class="px-4">In wishlist</p>
        </div>
        <div class="button-container">
          <button
            v-if="!isOwned && isInWishlist"
            type="button"
            class="z-20 wishlist-remove-icon icon"
            @click="removeFromWishlist($event)"
          >
            <fa :icon="['fa', 'star']" />
          </button>
          <button
            v-if="!isOwned && !isInWishlist"
            type="button"
            class="z-20 wishlist-icon icon"
            @click="addToWishlist($event)"
          >
            <fa :icon="['far', 'star']" />
          </button>
          <button
            v-if="!isOwned"
            type="button"
            class="z-20 add-icon icon"
            @click="addToOwned($event)"
          >
            <fa :icon="['fas', 'plus-circle']" />
          </button>
          <button
            v-if="isOwned"
            type="button"
            class="z-20 remove-icon icon"
            @click="removeFromOwned($event)"
          >
            <fa :icon="['fas', 'minus-circle']" />
          </button>
        </div>
      </div>
      <footer class="game-name__container">
        <h3 class="game-name">{{ gameName }}</h3>
      </footer>
    </div>
  </article>
</template>

<script>
import { mapGetters } from 'vuex'

export default {
  props: ['game'],
  data() {
    return {
      gameId: this.game.id.toString(),
      gameName: this.game.name
    }
  },
  computed: {
    gameImageId() {
      if (this.game.image_id) {
        return this.game.image_id
      } else if (this.game.cover) {
        return this.game.cover.image_id
      } else {
        return 'nocover_qhhlj6'
      }
    },
    // Check if game is owned
    isOwned() {
      if (!this.user) return

      const ownedGames = this.$store.state.users.ownedGamesObjArray
      if (!ownedGames) {
        return false
      } else {
        const gamesArray = ownedGames.map((game) => game.id)
        const result = gamesArray.some((game) => game === this.game.id)
        return result
      }
    },
    isInWishlist() {
      if (!this.user) return
      const wishlist = this.$store.state.users.wishlistGamesObjArray
      if (!wishlist) {
        return false
      } else {
        const gamesArray = wishlist.map((game) => game.id)
        const result = gamesArray.some((game) => game === this.game.id)
        return result
      }
    },
    ...mapGetters({
      user: 'users/getUser',
      ownedGames: 'users/ownedGames'
    })
  },
  methods: {
    addToOwned() {
      if (this.isLoggedIn() === false) return
      const gameObj = {
        title: this.gameName,
        id: this.gameId,
        image_url: this.gameImageId
      }
      this.$addGame(gameObj)
    },
    removeFromOwned() {
      if (this.isLoggedIn() === false) return
      const gameObj = {
        title: this.gameName,
        id: this.gameId,
        image_url: this.gameImageId
      }
      this.$removeGame(gameObj)
    },
    addToWishlist() {
      if (this.isLoggedIn() === false) return
      const gameObj = {
        title: this.gameName,
        id: this.gameId,
        image_url: this.gameImageId
      }
      this.$addToWishlist(gameObj)
    },
    removeFromWishlist() {
      if (this.isLoggedIn() === false) return
      const gameObj = {
        title: this.gameName,
        id: this.gameId,
        image_url: this.gameImageId
      }
      this.$removeFromWishlist(gameObj)
    },
    isLoggedIn() {
      if (!this.user) {
        this.$store.commit('setLoginModalOpenState', true)
        return false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.single-game {
  &:hover {
    .game-name__container {
      background-color: white;
      transition: background-color 0s ease-out;
      .game-name {
        color: black;
        cursor: default;
        transition: color 0s ease-out;
      }
    }
  }
  &.owned {
    .game-tile_cover-image {
      -webkit-filter: grayscale(1) brightness(0.6);
      filter: grayscale(1) brightness(0.6);
    }
  }
  .single-game__tag {
    @apply text-sm;
    position: absolute;
    bottom: 0;
    height: 2rem;
    background-color: var(--secondary-color);
    color: white;
    transform: translateX(0);
    transition: transform 0.2s ease-in;
  }
  .game-name__container {
    position: relative;
    background-color: var(--main-color);
    padding: 0.5rem 1rem;
    transition: background-color 0.2s ease-out 0.2s;
    .game-name {
      @apply text-sm;
      overflow: hidden;
      line-height: 1.5em;
      height: 3em;
      color: white;
      transition: color 0.1s ease-out 0.2s;
    }
  }
  .cover-container {
    max-height: 250px;
    overflow: hidden;
    position: relative;
    height: 100%;
    &:hover > .button-container {
      transform: translateX(0%);
      transition: transform 0.2s ease-in;
    }
    .game-tile_cover-image {
      min-height: 250px;
      object-fit: cover;
      transition: transform 0.2s ease-out;
      &:hover {
        transform: scale(1.2);
      }
    }
    .button-container {
      position: absolute;
      bottom: 0;
      right: 0;
      display: flex;
      transform: translateX(100%);
      transition: transform 0.2s ease-in;
      .icon {
        background-color: white;
        height: 2rem;
        width: 2rem;
        outline: none;
        &:hover,
        &:focus {
          cursor: pointer;
          transition: 0.2s ease-out;
        }
        svg {
          color: black;
          height: 1rem;
          width: 1rem;
        }
      }
      .add-icon {
        &:hover,
        &:focus {
          background-color: var(--secondary-color);
        }
      }
      .remove-icon {
        &:hover,
        &:focus {
          @apply bg-red-400;
        }
      }
      .wishlist-icon {
        &:hover,
        &:focus {
          @apply bg-yellow-400;
        }
      }
      .wishlist-remove-icon {
        &:hover,
        &:focus {
          @apply bg-red-400;
        }
      }
    }
  }
}

#library {
  .single-game {
    &.owned {
      padding-right: 5px;
      margin-bottom: 2rem;
      .game-tile_cover-image {
        -webkit-filter: grayscale(0) brightness(1);
        filter: grayscale(0) brightness(1);
      }
    }
    .single-game__tag {
      visibility: hidden;
    }
    .cover-container {
      max-height: 250px;
    }
  }
}

.search-results {
  .single-game {
    padding-right: 5px;
    margin-bottom: 2rem;
    .cover-container {
      &:hover > .single-game__tag {
        transform: translateX(-100%);
        transition: transform 0.2s ease-in;
      }
    }
  }
}

.library_games,
.wishlist_games {
  .single-game {
    padding-right: 3px;
    margin-bottom: 2rem;
  }
}
</style>
