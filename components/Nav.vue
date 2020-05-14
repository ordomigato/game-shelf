<template>
    <div class="nav-container bg-primary fixed w-full">
        <div class="container">
            <nav class="flex flex-1 text-white">
                <div class="flex items-center w-1/2">
                    <nuxt-link to="/"><strong>Game</strong>Shelf</nuxt-link>
                </div>
                <div class="w-1/2 flex items-center justify-end">
                    <ul class="flex">
                        <nuxt-link to="/library" v-if="user != null" class="nav-btn my-library-btn">My Library <fa class="ml-2" :icon="['fa', 'book']"  /></nuxt-link>
                        <li class="nav-btn" v-if="user == null"><button @click="setLoginModalOpenState(true)">Login</button></li>
                        <li class="nav-btn" v-if="user == null"><button @click="setSignupModalOpenState(true)">Signup</button></li>
                        <li class="nav-btn user-dropdown" v-if="user != null">
                          {{ user.email }}
                          <fa class="ml-1 caret" :icon="['fa', 'caret-down']" />
                          <fa class="ml-2" :icon="['fa', 'user-circle']" />
                          <ul class="user-dropdown-sub-1">
                            <li>Account Settings</li>
                            <li><button @click="signout">Logout</button></li>
                          </ul>
                        </li>
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
import Cookie from 'js-cookie'

import LoginModal from '~/components/LoginModal.vue'
import SignupModal from '~/components/SignupModal.vue'

export default ({
  components: {
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

      // hard refresh
      location.href = '/';
    }
  },
})
</script>

<style lang="scss" scoped>
#main-page {
  .nav-container {
    background-color: rgba(255, 255, 255, 0);
  }
}

.nav-btn {
    @apply py-2 px-4;
}

.my-library-btn {
    background-color: var(--secondary-color);
    height: 100%;
}

.user-dropdown {
  position: relative;
  &:hover {
    .caret {
      opacity: 1;
    }
    .user-dropdown-sub-1 {
      visibility: visible;
    }
  }
  .caret {
    opacity: 0.5;
  }
  .user-dropdown-sub-1 {
    @apply shadow-md;
    visibility: hidden;
    background-color: white;
    color: black;
    padding: 1rem 2rem;
    position: absolute;
    width: 100%;
    left: 0px;
  }
}
</style>>
