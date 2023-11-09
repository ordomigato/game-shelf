<template>
  <section class="">
    <transition name="fade">
      <div
        v-if="isOpen"
        class="overlay"
        @click="setSignupModalOpenState(false)"
      ></div>
    </transition>
    <transition name="slide-fade">
      <div v-if="isOpen" class="signup-modal self-center">
        <ul id="signup-error-message" class="text-red-400"></ul>
        <h4 class="text-lg text-center">Signup</h4>
        <p class="text-sm text-center mb-4">Fill out the required* fields</p>
        <form class="flex flex-col" @submit.prevent="onSubmit">
          <div class="flex flex-col sm:flex-row">
            <input
              v-model="user.firstName"
              class="flex-1"
              type="text"
              placeholder="Enter First Name*"
              name="first-name"
            />
            <input
              v-model="user.lastName"
              class="flex-1 sm:ml-2"
              type="text"
              placeholder="Enter Last Name*"
              name="last-name"
            />
          </div>
          <input
            v-model="user.email"
            type="text"
            placeholder="Enter email*"
            name="email"
          />
          <input
            v-model="user.password"
            type="password"
            placeholder="Enter password*"
            name="password"
          />
          <input
            v-model="user.passwordConfirm"
            type="password"
            placeholder="Confirm password*"
            name="confirm-password"
          />
          <button
            class="bg-secondary text-white p-2 focus:outline-none"
            type="submit"
          >
            Signup
          </button>
        </form>
        <p class="text-center mt-2">
          Already a user?
          <button
            class="text-blue-400"
            @click="
              setSignupModalOpenState(false)
              setLoginModalOpenState(true)
            "
          >
            Login here
          </button>
        </p>
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
        passwordConfirm: ''
      }
    }
  },
  computed: {
    isOpen() {
      return this.$store.state.showSignupModal
    }
  },
  methods: {
    setSignupModalOpenState(arg) {
      this.$store.commit('setSignupModalOpenState', arg)
    },
    setLoginModalOpenState(arg) {
      this.$store.commit('setLoginModalOpenState', arg)
    },
    onSubmit() {
      const errorMessages = []
      const errorContainer = document.querySelector('#signup-error-message')
      if (this.user.firstName === '')
        errorMessages.push('Please enter your first name')
      if (this.user.lastName === '')
        errorMessages.push('Please enter your last name')
      if (this.user.email === '') errorMessages.push('Please enter your email')
      if (this.user.password === '')
        errorMessages.push('Please enter a password')
      if (this.user.password.length < 6)
        errorMessages.push('Passwords must be 6 characters or more')
      if (this.user.passwordConfirm === '')
        errorMessages.push('Please confirm your password')
      if (this.user.password !== this.user.passwordConfirm)
        errorMessages.push('Passwords do not match')
      if (errorMessages.length > 0) {
        let li = ''
        errorMessages.forEach((message) => {
          li += `<li class="text-sm">${message}</li>`
        })
        errorContainer.innerHTML = li
      } else {
        errorContainer.innerHTML = ''
        // sign up the user
        try {
          this.$fireAuth
            .createUserWithEmailAndPassword(this.user.email, this.user.password)
            .then((cred) => {
              return this.$fireStore
                .collection('users')
                .doc(cred.user.uid)
                .set({
                  // add user to firestore
                  uid: cred.user.uid,
                  first_name: this.user.firstName,
                  last_name: this.user.lastName,
                  email: cred.user.email,
                  owned_games: [],
                  wishlist: [],
                  profile_pic:
                    'https://firebasestorage.googleapis.com/v0/b/gameshelf-510ba.appspot.com/o/profile%2Fdefault-image.jpg?alt=media&token=87dbe8ab-445f-4487-8f30-40a24b494e21',
                  joined: {
                    year: new Date().getFullYear(),
                    month: new Date().getMonth(),
                    day: new Date().getDate()
                  }
                })
            })
            .then(() => {
              // close the signup modal & reset form
              this.$store.dispatch('users/login', this.user)
              this.setSignupModalOpenState(false)
              this.email = ''
              this.password = ''
            })
            .catch((err) => {
              errorContainer.innerHTML += `<li class="text-sm">${err}</li>`
            })
        } catch (err) {
          errorContainer.innerHTML +=
            errorContainer.innerHTML + `<li class="text-sm">${err}</li>`
        }
      }
    }
  }
}
</script>

<style lang="scss" scoped>
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

.signup-modal {
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
