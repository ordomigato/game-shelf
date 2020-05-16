<template>
    <article class="single-game" :data-game-id="this.gameId" :class="{'owned': isOwned}">
      <div class="cover-container">
        <a href="#"><img :src="`//images.igdb.com/igdb/image/upload/t_cover_big_2x/${gameImageId}.jpg`" alt="cover image" class="game-tile_cover-image" /></a>
        <div class="button-container">
          <button type="button" v-if="!isOwned && isInWishlist" class="z-20 wishlist-remove-icon icon" v-on:click="removeFromWishlist($event)">
            <fa :icon="['fa', 'star']"  />
          </button>
          <button type="button" v-if="!isOwned && !isInWishlist" class="z-20 wishlist-icon icon" v-on:click="addToWishlist($event)">
            <fa :icon="['far', 'star']"  />
          </button>
          <button type="button" v-if="!isOwned" class="z-20 add-icon icon" v-on:click="addToOwned($event)">
            <fa :icon="['fa', 'plus']"  />
          </button>
          <button type="button" v-if="isOwned" class="z-20 remove-icon icon" v-on:click="removeFromOwned($event)">
            <fa :icon="['fa', 'minus']"  />
          </button>
        </div>
      </div>
      <h3 class="game-name">{{ this.gameName }}</h3>
    </article>
</template>

<script>
import { mapGetters } from 'vuex'

export default {
  computed: {
    gameImageId: function () {
      if (this.game.image_id) {
        return  this.game.image_id
      } else if (this.game.cover) {
        return this.game.cover.image_id
      } else {
        return 'nocover_qhhlj6'
      }
    },
    // Check if game is owned
    isOwned: function () {
      if (!this.user) return
      let ownedGames = this.$store.state.users.user.owned_games
      if (!ownedGames) {
        return false
      } else {
        let result = ownedGames.some(game => game == this.game.id)
        return result
      }
    },
    isInWishlist: function () {
      if (!this.user) return
      let wishlist = this.$store.state.users.user.wishlist
      if (!wishlist) return false
      else {
        let result = wishlist.some(game => game == this.game.id)
        return result
      }
    },
    ...mapGetters({
      user: 'users/getUser',
      ownedGames: 'users/ownedGames'
    }),
  },
  props: [
    'game'
  ],
  data() {
    return {
      gameId: this.game.id.toString(),
      gameName: this.game.name,
    }
  },
  methods: {
    async addToOwned($event) {
      if (!this.user) return
      this.$addGame(this.gameId, this.gameImageId)
    },
    async removeFromOwned($event) {
      if (!this.user) return
      this.$removeGame(this.gameId)
    },
    async addToWishlist($event) {
      if (!this.user) return
      this.$addToWishlist(this.gameId, this.gameImageId)
    },
    async removeFromWishlist($event) {
      if (!this.user) return
      this.$removeFromWishlist(this.gameId)
    },
  }
}
</script>

<style lang="scss" scoped>
.single-game {
  &.owned {
    .game-tile_cover-image {
      -webkit-filter: grayscale(1) brightness(0.6);
      filter: grayscale(1) brightness(0.6);
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
      transition: transform .2s ease-out;
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
      .icon {
        background-color: black;
        padding: 1rem;
        outline: none;
        &:hover, &:focus {
          cursor: pointer;
          transition: 0.2s ease-out;
        }
        svg {
          color: white;
          height: 1rem;
          width: 1rem;
        }
      }
      .add-icon {
        &:hover, &:focus {
          background-color: var(--secondary-color);
        }
      }
      .remove-icon {
        &:hover, &:focus {
          @apply bg-red-400
        }
      }
      .wishlist-icon {
        &:hover, &:focus {
          @apply bg-yellow-400
        }
      }
      .wishlist-remove-icon {
        &:hover, &:focus {
          @apply bg-red-400
        }
      }
    }
  }
}

#library {
  .single-game {
    &.owned {
      .game-tile_cover-image {
        -webkit-filter: grayscale(0) brightness(1);
        filter: grayscale(0) brightness(1);
      }
    }
    .cover-container {
      max-height: 200px;
    }
  }
}

.search-results {
  .single-game {
    padding-right: 5px;
    margin-bottom: 2rem;
  }
}
</style>