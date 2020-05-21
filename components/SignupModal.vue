<template>
    <section class="">
      <transition name="fade">
        <div v-if="isOpen" @click="setSignupModalOpenState(false)" class="overlay"></div>
      </transition>
      <transition name="slide-fade">
        <div class="signup-modal self-center" v-if="isOpen">
          <ul id="signup-error-message" class="text-red-400"></ul>
          <h4 class="text-lg text-center">Signup</h4>
          <p class="text-sm mb-4">* means it is required</p>
          <form class="flex flex-col" @submit.prevent="onSubmit">
            <div class="flex flex-col sm:flex-row">
              <input class="flex-1" type="text" placeholder="Enter First Name*" name="first-name" v-model="user.firstName" />
              <input class="flex-1 sm:ml-2" type="text" placeholder="Enter Last Name*" name="last-name" v-model="user.lastName" />
            </div>
            <input type="text" placeholder="Enter email*" name="email" v-model="user.email" />
            <input type="password" placeholder="Enter password*" name="password" v-model="user.password" />
            <input type="password" placeholder="Confirm password*" name="confirm-password" v-model="user.passwordConfirm" />
            <button class="bg-secondary text-white p-2 focus:outline-none" type="submit">Signup</button>
          </form>
          <p class="text-center mt-2">Already a user? <button class="text-blue-400" @click="setSignupModalOpenState(false);setLoginModalOpenState(true)">Login here</button></p>
        </div>
      </transition>
    </section>
</template>

<script>
export default {
  data() {
    return {
      user: {
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        passwordConfirm: '',
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
    setLoginModalOpenState: function (arg) {
      this.$store.commit('setLoginModalOpenState', arg)
    },
    async onSubmit() {
      let errorMessages = []
      let errorContainer = document.querySelector('#signup-error-message')
      if(this.user.firstName == '') errorMessages.push('Please enter your first name')
      if(this.user.lastName == '') errorMessages.push('Please enter your last name')
      if(this.user.email == '') errorMessages.push('Please enter your email')
      if(this.user.password == '') errorMessages.push('Please enter a password')
      if(this.user.password.length < 6) errorMessages.push('Passwords must be 6 characters or more')
      if(this.user.passwordConfirm == '') errorMessages.push('Please confirm your password')
      if(this.user.password !== this.user.passwordConfirm) errorMessages.push('Passwords do not match')

      console.log(errorMessages.length)
      if(errorMessages.length > 0) {
        let li = ''
        errorMessages.forEach( message => {
          li += `<li class="text-sm">${message}</li>`
        })
        errorContainer.innerHTML = li
        return
      } else {
        errorContainer.innerHTML = ''
        // sign up the user
        try {
          this.$fireAuth.createUserWithEmailAndPassword(this.user.email, this.user.password).then(cred => {
            return this.$fireStore.collection('users').doc(cred.user.uid).set({
              // add user to firestore
              uid: cred.user.uid,
              first_name: this.user.firstName,
              last_name: this.user.lastName,
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
            errorContainer.innerHTML += `<li class="text-sm">${err}</li>`
          })
        } catch (err) {
          errorContainer.innerHTML += errorContainer.innerHTML + `<li class="text-sm">${err}</li>`
        }
      }
    },
  }
}
</script>

<style lang="scss" scoped>
.overlay {
  @apply fixed inset-0 z-40;
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
  transform: translate(-50%, -50%);
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
