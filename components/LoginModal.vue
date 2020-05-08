<template>
    <section class="">
      <transition name="fade">
        <div v-if="isOpen" @click="setLoginModalOpenState(false)" class="overlay"></div>
      </transition>
      <transition name="slide-fade">
        <div class="login-modal self-center" v-if="isOpen">
          <p>Login Modal</p>
          <form class="flex flex-col" @submit.prevent="login">
            <label> Email:
              <input type="text" placeholder="Enter email" name="email" v-model="user.email" />
            </label>
            <label> Password:
              <input type="text" placeholder="Enter password" name="password" v-model="user.password" />
            </label>
            <button type="submit">Login</button>
            <label>
              <input type="checkbox" checked="checked" name="remember"> Remember me </input>
            </label>
          </form>
        </div>
      </transition>
    </section>
</template>

<script>
import * as firebase from 'firebase/app'
import 'firebase/auth'

export default {
  data() {
    return {
      user: {
        email: '',
        password: ''
      }
    }
  },
  computed: {
    isOpen() {
      return this.$store.state.showLoginModal
    }
  },
  methods: {
    setLoginModalOpenState (arg) {
      this.$store.commit('setLoginModalOpenState', arg)
    },
    async login() {
      // log the user in and set basic data
      await this.$store.dispatch('users/login', this.user)
      this.setLoginModalOpenState(false)
    },
  }
}
</script>

<style scoped>

.overlay {
  @apply absolute inset-0 z-40;
  background-color: #2d3748;
  opacity: 0.75;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity .3s;
}
.fade-enter, .fade-leave-to
{
  opacity: 0;
}
.fade-enter-to, .fade-leave {
  opacity: 0.75;
}

.login-modal {
  @apply fixed bg-white w-4/5 max-w-screen-sm mx-auto block p-8 rounded z-50 shadow-xl;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%)
}
.slide-fade-enter-active, .slide-fade-leave-active {
  transition: all 0.3s ease;
}
.slide-fade-enter, .slide-fade-leave-to
{
  opacity: 0;
  transform: translate(100%, -50%);
}
.fade-enter-to, .fade-leave {
  opacity: 0.75;
}

</style>>
