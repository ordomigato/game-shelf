<template>
  <section class="pt-4 pb-8 mx-4">
    <div class="container">
      <h2 class="font-bold pb-4">My Profile</h2>
      <div class="flex flex-col md:flex-row">
        <div class="w-full md:w-2/3 lg:w-1/2 flex">
          <div class="profile-image_container">
            <img :src="user.profile_pic">
          </div>
          <div class="profile-image_container px-8">
            <p>Games Owned: {{ ownedGames == undefined ? 0 : ownedGames.length }}</p>
            <p>Wishlist: {{ wishlist == undefined ? 0 : wishlist.length }}</p>
            <p>Joined: {{ joined }}</p>
          </div>
        </div>
        <div id="bio" class="w-full md:w-1/3 lg:w-1/2 pt-4 md:pt-0">
          <h3 class="font-bold pb-2 pr-1 inline-block">Bio</h3>
          <div class="inline-block" id="update-bio-icon">
            <fa v-if="!currentlyEditing" :icon="['fa', 'edit']" @click="editProfileBio" class="edit-icon" />
            <fa v-if="currentlyEditing" :icon="['fas', 'times']" @click="stopEditProfileBio" class="stop-icon" />
          </div>
          <div id="update-bio_error-container"></div>
          <textarea @change="editingHandler" id="profile-bio" rows="5" class="w-full" v-model="editBio" placeholder="Tell us about yourself <(^_^)>" readonly></textarea>
          <button v-if="currentlyEditing" id="update-bio-button" @click="submitBio" class="bg-secondary mt-2 text-white py-2 px-4 opacity-50 focus:outline-none cursor-default" type="button" disabled>Change Bio</button>
          <div class="favourite-games">
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import { mapGetters } from 'vuex'

export default {
  data() {
    return {
      editBio: '',
      currentlyEditing: false,
    }
  },
  mounted() {
    this.editBio = this.bio
  },
  computed: {
    ...mapGetters({
      user: 'users/getUser',
      bio: 'users/getBio',
      ownedGames: 'users/getOwnedGames',
      wishlist: 'users/getWishlist',
      joined: 'users/getJoinedDate'
    })
  },
  methods: {
    editingHandler: function() {
      // change css of button and textarea
      let textarea = document.getElementById('profile-bio')
      let button = document.getElementById('update-bio-button')
      if(this.editBio !== this.bio) {
        button.classList.remove("opacity-50","cursor-default")
        button.disabled = false
      } else {
        button.classList.add("opacity-50","cursor-default")
        button.disabled = true
      }
    },
    editProfileBio: function() {
      let textarea = document.getElementById('profile-bio')
      let button = document.getElementById('update-bio-button')
      textarea.readOnly = false
      textarea.focus()
      this.currentlyEditing = true
    },
    stopEditProfileBio: function() {
      let textarea = document.getElementById('profile-bio')
      textarea.readOnly = true
      this.currentlyEditing = false
    },
    submitBio: function() {
      const errorContainer = document.getElementById('update-bio_error-container')
      errorContainer.innerHTML = ''
      // Check if bio is different
      if (this.bio === this.editBio) return
      if (this.editBio.length > 200) {
        errorContainer.innerHTML = `<p class="text-red-400">Warning: ${this.editBio.length} characters - Bio must be under 200 characters</p>`
        return
      }
      // submit new bio
      this.$fireStore.collection('users').doc(this.user.uid).update({
        bio: this.editBio
      })
      .then(() => {
        let textarea = document.getElementById('profile-bio')
        textarea.readOnly = true
      })
      .catch(err => {
        errorContainer.innerHTML = `<p class="text-red-400">${err}</p>`
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.profile-image_container {
  img {
    height: 260px;
    width: 260px;
    object-fit: cover;
    }
  }

#bio {
  #profile-bio {
    @apply shadow-md px-4 py-2;
    transition: padding 0.2s ease-in;
    resize: none;
    outline: none;
    &:focus {
      border-left: 4px solid var(--secondary-color);
      transition: all 0.1s ease-out
    }
    &:hover {
      @apply shadow-md px-4 py-2;
      cursor: text;
    }
    &[readonly] {
      @apply shadow-none p-0;
      cursor: default;
      &:focus {
        border-left: 0px;
        transition: all 0.1s ease-out
      }
    }
  }
}
</style>