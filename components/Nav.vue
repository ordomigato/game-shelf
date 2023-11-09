<template>
  <div>
    <div
      class="nav-container bg-primary fixed w-full z-50"
      :class="{ change_color: scrollPosition > 50 }"
    >
      <div class="container">
        <nav class="flex flex-1 text-white px-4">
          <div class="flex items-center w-1/3 sm:w-1/2">
            <nuxt-link to="/"><strong>Game</strong>Shelf</nuxt-link>
          </div>
          <div class="w-2/3 sm:w-1/2 flex items-center justify-end">
            <ul class="flex">
              <!-- <nuxt-link to="/library" v-if="user != null" class="nav-btn my-library-btn">My Library <fa class="ml-2" :icon="['fa', 'book']"  /></nuxt-link> -->
              <li v-if="user == null">
                <button
                  class="nav-btn login-btn"
                  @click="setLoginModalOpenState(true)"
                >
                  Login
                </button>
              </li>
              <li v-if="user == null" class="signup">
                <button
                  class="nav-btn signup-btn"
                  @click="setSignupModalOpenState(true)"
                >
                  Signup
                </button>
              </li>
              <li v-if="user != null" class="nav-btn user-dropdown">
                {{ user.first_name || user.email }}
                <fa class="ml-1 caret text-md" :icon="['fa', 'caret-down']" />
                <fa class="ml-2 text-md" :icon="['fa', 'user-circle']" />
                <ul class="user-dropdown-sub-1">
                  <li>
                    <nuxt-link to="/library" class="user-dropdown-sub-1__item"
                      >My Library</nuxt-link
                    >
                  </li>
                  <li>
                    <nuxt-link
                      v-if="user != null"
                      to="/account"
                      class="user-dropdown-sub-1__item"
                      >My Account</nuxt-link
                    >
                  </li>
                  <li>
                    <button class="user-dropdown-sub-1__item" @click="signout">
                      Logout
                    </button>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </nav>
      </div>
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

export default {
  components: {
    LoginModal,
    SignupModal
  },
  data() {
    return {
      scrollPosition: null
    }
  },
  computed: {
    ...mapGetters({
      user: 'users/getUser'
    })
  },
  mounted() {
    window.addEventListener('scroll', this.updateScroll)
  },
  methods: {
    setLoginModalOpenState(arg) {
      this.$store.commit('setLoginModalOpenState', arg)
    },
    setSignupModalOpenState(arg) {
      this.$store.commit('setSignupModalOpenState', arg)
    },
    async signout() {
      await this.$fireAuth.signOut()
      await Cookie.remove('access_token')
      // hard refresh
      location.href = '/'
    },
    updateScroll() {
      this.scrollPosition = window.scrollY
    }
  }
}
</script>

<style lang="scss" scoped>
#main-page {
  .nav-container {
    background-color: rgba(255, 255, 255, 0);
    &.change_color {
      @apply shadow-md;
      background-color: var(--main-color);
      transition: background-color 0.2s ease-out;
    }
  }
}

.nav-btn {
  @apply py-2 px-4;
  &.login-btn {
    &:hover,
    &:focus {
      background-color: var(--secondary-color);
      transition: background-color 0.2s ease-out;
      outline: none;
    }
  }
  &.signup-btn {
    &:hover,
    &:focus {
      background-color: var(--secondary-color);
      transition: background-color 0.2s ease-out;
      outline: none;
    }
  }
}

.my-library-btn,
.signup {
  background-color: var(--main-color);
  height: 100%;
}

.user-dropdown {
  background-color: var(--main-color);
  height: 100%;
  min-width: 120px;
  position: relative;
  cursor: default;
  &:hover {
    .caret {
      opacity: 1;
    }
    .user-dropdown-sub-1 {
      visibility: visible;
      opacity: 1;
      transition: opacity 0.2s ease-out;
    }
  }
  .caret {
    opacity: 0.5;
  }
  .user-dropdown-sub-1 {
    @apply shadow-md;
    width: 100%;
    visibility: hidden;
    opacity: 0;
    background-color: white;
    color: black;
    position: absolute;
    right: 0px;
    top: 100%;
    transition: opacity 0.2s ease-out;
    &:before {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: -7px;
      width: 14px;
      height: 14px;
      margin: auto;
      border: solid white;
      border-width: 5px 5px 0 0;
      transform: rotate(-45deg);
      background-color: white;
    }
    &:after {
      content: '';
      position: absolute;
      visibility: hidden;
      opacity: 0;
      top: 0;
    }
    li {
      // white-space: nowrap;
      .user-dropdown-sub-1__item {
        @apply py-1 px-4;
        display: block;
        &:hover {
          @apply text-blue-400;
        }
      }
      &:last-of-type {
        padding-bottom: 0.5rem;
      }
      &:first-of-type {
        padding-top: 0.5rem;
      }
    }
  }
}</style
>>
