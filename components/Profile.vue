<template>
  <section class="pt-4 pb-8">
    <div class="container">
      <h2 class="font-bold pb-4">My Profile</h2>
      <div class="flex">
        <div class="w-1/2 flex">
          <div class="profile-image bg-gray-400"></div>
          <div class="profile-image_container px-8">
            <p>Games Owned: {{ ownedGames == undefined ? 0 : ownedGames.length }}</p>
            <p>Wishlist:</p>
            <p>Joined</p>
            <p>Recently Added</p>
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
      ownedGames: 'users/getOwnedGames',
    })
  }
}
</script>

<style scoped>
  .profile-image {
    height: 260px;
    width: 260px;
  }
</style>