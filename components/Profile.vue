<template>
  <section class="pt-4 pb-8">
    <div class="container">
      <h2 class="font-bold pb-4">My Profile</h2>
      <div class="flex flex-col md:flex-row">
        <div class="w-full md:w-2/3 flex">
          <div class="profile-image_container">
            <img :src="user.profile_pic">
          </div>
          <div class="profile-image_container px-8">
            <p>Games Owned: {{ ownedGames == undefined ? 0 : ownedGames.length }}</p>
            <p>Wishlist: {{ wishlist == undefined ? 0 : wishlist.length }}</p>
            <p>Joined: {{ joined }}</p>
          </div>
        </div>
        <div class="">
          <h3>My brief bio</h3>
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
  computed: {
    ...mapGetters({
      user: 'users/getUser',
      ownedGames: 'users/getOwnedGames',
      wishlist: 'users/getWishlist',
      joined: 'users/getJoinedDate'
    })
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
</style>