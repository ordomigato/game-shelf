<template>
  <section class="">
    <transition name="fade">
      <div
        v-if="isOpen"
        class="overlay"
        @click="setLoginModalOpenState(false)"
      ></div>
    </transition>
    <transition name="slide-fade">
      <div v-if="isOpen" class="login-modal self-center">
        <div id="login-message" class="text-sm text-red-400"></div>
        <h4 class="text-lg text-center mb-4">Login</h4>
        <form class="flex flex-col" @submit.prevent="login">
          <input
            v-model="user.email"
            type="text"
            placeholder="Enter email"
            name="email"
          />
          <input
            v-model="user.password"
            type="password"
            placeholder="Enter password"
            name="password"
          />
          <button
            class="bg-secondary text-white p-2 focus:outline-none"
            type="submit"
          >
            Login
          </button>
        </form>
        <p class="text-center mt-2">
          Don't have an account?
          <button
            class="text-blue-400"
            @click="
              setLoginModalOpenState(false)
              setSignupModalOpenState(true)
            "
          >
            Signup here
          </button>
        </p>
      </div>
    </transition>
  </section>
</template>

<script>
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
    setLoginModalOpenState(arg) {
      this.$store.commit('setLoginModalOpenState', arg)
    },
    setSignupModalOpenState(arg) {
      this.$store.commit('setSignupModalOpenState', arg)
    },
    login() {
      // log the user in and set basic data
      this.$store
        .dispatch('users/login', this.user)
        .then(() => {
          this.$store.commit('setLoginModalOpenState', false)
        })
        .catch((err) => {
          const messageContainer = document.getElementById('login-message')
          messageContainer.innerHTML = `<p>${err}</p>`
        })
    }
  }
}
</script>

<style scoped>
.overlay {
  @apply fixed inset-0 z-40;
  background-color: #2d3748;
  opacity: 0.75;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
.fade-enter-to,
.fade-leave {
  opacity: 0.75;
}

.login-modal {
  @apply fixed bg-white w-4/5 max-w-screen-sm mx-auto block p-8 rounded z-50 shadow-xl;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}
.slide-fade-enter,
.slide-fade-leave-to {
  opacity: 0;
  transform: translate(100%, -50%);
}
.fade-enter-to,
.fade-leave {
  opacity: 0.75;
}</style
>>
