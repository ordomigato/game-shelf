<template>
    <section class="">
      <transition name="fade">
        <div v-if="isOpen" @click="setSignupModalOpenState(false)" class="overlay"></div>
      </transition>
      <transition name="slide-fade">
        <div class="signup-modal self-center" v-if="isOpen">
          <p>Signup Modal</p>
          <form class="flex flex-col" @submit.prevent="onSubmit">
            <label> Email:
              <input type="text" placeholder="Enter email" name="email" v-model="user.email" />
            </label>
            <label> Password:
              <input type="text" placeholder="Enter password" name="password" v-model="user.password" />
            </label>
            <button type="submit">Signup</button>
            <label>
              <input type="checkbox" checked="checked" name="remember"> Remember me </input>
            </label>
          </form>
        </div>
      </transition>
    </section>
</template>

<script>
export default {
  data() {
    return {
      user: {
        email: '',
        password: '',
      }
    }
  },
  computed: {
    isOpen() {
      return this.$store.state.showSignupModal
    }
  },
  methods: {
    setSignupModalOpenState: function (arg) {
      this.$store.commit('setSignupModalOpenState', arg)
    },
    async onSubmit() {
      // sign up the user
      try {
        this.$fireAuth.createUserWithEmailAndPassword(this.user.email, this.user.password).then(cred => {
          return this.$fireStore.collection('users').doc(cred.user.uid).set({
            // add user to firestore
            uid: cred.user.uid,
            email: cred.user.email,
            owned_games: [],
            wishlist: [],
            joined: {
              year: new Date().getFullYear(),
              month: new Date().getMonth(),
              day: new Date().getDate(),
            }
          })
        }).then(() => {
          // close the signup modal & reset form
          this.$store.dispatch('users/login', this.user)
          this.setSignupModalOpenState(false)
          this.email = ''
          this.password = ''
        }).catch(err => {
          console.log(err)
        })
      } catch (err) {
        console.log(err)
      }
    },
  }
}
</script>

<style scoped>

.overlay {
  @apply absolute w-full h-full inset-0;
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

.signup-modal {
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
