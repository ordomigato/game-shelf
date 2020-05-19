<template>
  <div class="account-settings-page page">
    <Nav />
    <main class="nav-padding container">
      <h2 class="pt-4 pb-2 font-bold ml-4"> Account Settings</h2>
      <div class="mx-auto px-8 py-8 shadow-md">
        <ul id="account-message-container" class="text-red-400"></ul>
        <p>Name: <span class="font-bold">{{user.first_name}} {{user.last_name}}</span></p>
        <form class="account-info-form flex flex-col pt-2 w-full" @submit.prevent="changeUserInfo">
          <div class="flex flex-col">
            <input type="text" placeholder="Change First Name" name="first-name" v-model="userInfo.firstName" />
            <input type="text" placeholder="Change Last Name" name="last-name" v-model="userInfo.lastName" />
          </div>
          <button class="bg-secondary text-white p-2 focus:outline-none" type="submit">Save Info</button>
        </form>
        <form class="account-info-form flex flex-col pt-2 w-full" @submit.prevent="changeUserEmail">
          <label class="pb-2">Change email:</label>
          <input type="text" placeholder="Enter email" name="email" v-model="userInfo.email" />
          <input type="password" placeholder="Enter current password" name="current-password" v-model="userInfo.currentPassword" />
          <button class="bg-secondary text-white p-2 focus:outline-none" type="submit">Submit Email Change</button>
        </form>
        <form class="account-info-form flex flex-col pt-2 w-full" @submit.prevent="changePassword" autocomplete="off">
          <label class="pb-2">Change password:</label>
          <input type="password" placeholder="Enter old password" name="old-password" v-model="userInfo.oldPassword" />
          <input type="password" placeholder="Enter new password" name="new-password" v-model="userInfo.password" />
          <input type="password" placeholder="Confirm new password" name="confirm-password" v-model="userInfo.passwordConfirm" />
          <button class="bg-secondary text-white p-2 focus:outline-none" type="submit">Submit Password Change</button>
        </form>
      </div>
    </main>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'

import Nav from '~/components/Nav.vue'

export default {
  data() {
    return {
      userInfo: {
        firstName: '',
        lastName: '',
        email: '',
        currentPassword: '',
        oldPassword: '',
        password: '',
        passwordConfirm: '',
      }
    }
  },
  methods: {
    changeUserInfo: function() {
      let currentUser = this.$fireAuth.currentUser
      let newFirstName = () => {
        if (this.userInfo.firstName === '') {
          let firstName = this.user.first_name || ''
          return firstName
        } else {
          return this.userInfo.firstName
        }
      }
      let newLastName = () => {
        if (this.userInfo.lastName === '') {
          let lastName = this.user.last_name || ''
          return lastName
        } else {
          return this.userInfo.lastName
        }
      }
      this.$fireStore.collection('users').doc(currentUser.uid).update({
        first_name: newFirstName(),
        last_name: newLastName()
      })
    },
    reauthenticate: function(oldPassword) {
      let currentUser = this.$fireAuth.currentUser
      let cred = this.$fireAuthObj.EmailAuthProvider.credential(currentUser.email, oldPassword)
      return currentUser.reauthenticateWithCredential(cred)
    },
    changePassword: function() {
      let errorMessages = []
      let messageContainer = document.querySelector('#account-message-container')
      if(this.userInfo.password.length < 6) errorMessages.push('New password must be 6 characters or more')
      if(this.userInfo.passwordConfirm == '') errorMessages.push('Please confirm your new password')
      if(this.userInfo.password !== this.userInfo.passwordConfirm) errorMessages.push('new passwords do not match')
      console.log(errorMessages)
      if(errorMessages.length > 0) {
        let li = ''
        errorMessages.forEach( message => {
          li += `<li class="text-sm">${message}</li>`
        })
        messageContainer.innerHTML = li
        this.resetFields()
        return
      } else {
        this.reauthenticate(this.userInfo.oldPassword).then(() => {
          let currentUser = this.$fireAuth.currentUser
          currentUser.updatePassword(this.userInfo.password).then(() => {
            messageContainer.innerHTML = `<li class="text-sm text-green-400">Successfully changed password!</li>`
            this.resetFields()
          }).catch(err => {
            messageContainer.innerHTML = `<li class="text-sm">${err}</li>`
            this.resetFields()
          })
        }).catch( err => {
          messageContainer.innerHTML = `<li class="text-sm">${err}</li>`
          this.resetFields()
        })
      }
    },
    changeUserEmail: function() {
      let messageContainer = document.querySelector('#account-message-container')
      this.reauthenticate(this.userInfo.currentPassword).then(() => {
        let currentUser = this.$fireAuth.currentUser
        currentUser.updateEmail(this.userInfo.email).then(() => {
          this.$fireStore.collection('users').doc(currentUser.uid).update({
            email: this.userInfo.email
          })
          this.resetFields()
          messageContainer.innerHTML = `<li class="text-sm text-green-400">Successfully changed email!</li>`
        }).catch(err => {
          messageContainer.innerHTML = `<li class="text-sm">${err}</li>`
        })
      }).catch( err => {
        messageContainer.innerHTML = `<li class="text-sm">${err}</li>`
      })
    },
    resetFields: function() {
      this.userInfo.firstName = ''
      this.userInfo.lastName = ''
      this.userInfo.email = ''
      this.userInfo.currentPassword = ''
      this.userInfo.oldPassword = ''
      this.userInfo.password = ''
      this.userInfo.passwordConfirm = ''
    }
  },
  components: {
    Nav,
  },
  computed: {
    ...mapGetters({
      user: 'users/getUser',
    })
  },
}
</script>

<style lang="scss" scoped>
.account-settings-page {
  input {
    @apply border border-gray-300 p-2 mb-2;
  }
  input, button {
    max-width: 300px;
  }
}
</style>