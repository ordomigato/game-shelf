<template>
    <div class="bg-gray-500 bg-primary">
        <div class="container">
            <nav class="flex flex-1 text-white">
                <div class="flex items-center w-1/2">
                    <Logo />
                    <nuxt-link to="/"><strong>Game</strong>Shelf</nuxt-link>
                </div>
                <div class="w-1/2 flex items-center justify-end">
                    <ul class="flex">
                        <nuxt-link to="/library" v-if="user != null" class="nav-btn my-library-btn">My Library</nuxt-link>
                        <li class="nav-btn" v-if="user == null"><button @click="setLoginModalOpenState(true)">Login</button></li>
                        <li class="nav-btn" v-if="user == null"><button @click="setSignupModalOpenState(true)">Signup</button></li>
                        <li class="nav-btn" v-if="user != null"><button @click="signout">Logout</button></li>
                    </ul>
                </div>
            </nav>
        </div>
        <LoginModal />
        <SignupModal />
    </div>
</template>

<script>
import { mapGetters } from 'vuex'
import Logo from '~/components/Logo.vue'
import Cookie from 'js-cookie'

import LoginModal from '~/components/LoginModal.vue'
import SignupModal from '~/components/SignupModal.vue'

export default ({
  components: {
    Logo,
    LoginModal,
    SignupModal,
  },
  computed: {
    ...mapGetters({
      user: 'users/getUser'
    })
  },
  methods: {
    setLoginModalOpenState: function (arg) {
      this.$store.commit('setLoginModalOpenState', arg)
    },
    setSignupModalOpenState: function (arg) {
      this.$store.commit('setSignupModalOpenState', arg)
    },
    async signout() {
      await this.$fireAuth.signOut()
      await Cookie.remove('access_token')
      this.$store.commit('users/removeUser')

      // hard refresh
      location.href = '/';
    }
  },
})
</script>

<style scoped>
.NuxtLogo {
    height: 2rem;
    width: 2rem;
    margin: 0 1rem 0 0;
}

.nav-btn {
    @apply py-2 px-4;
}

.my-library-btn {
    background-color: var(--secondary-color);
    height: 100%;
}
</style>>
