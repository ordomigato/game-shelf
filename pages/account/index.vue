<template>
  <div class="account-settings-page page">
    <Nav />
    <main class="nav-padding container">
      <h2 class="pt-4 pb-2 font-bold ml-4">Account Settings</h2>
      <div class="mx-auto px-8 py-8 shadow-md">
        <ul id="account-message-container" class="text-red-400"></ul>
        <p>
          Name:
          <span class="font-bold"
            >{{ user.first_name }} {{ user.last_name }}</span
          >
        </p>
        <form
          class="account-info-form flex flex-col pt-2 w-full"
          @submit.prevent="changeUserInfo"
        >
          <div class="flex flex-col">
            <input
              v-model="userInfo.firstName"
              type="text"
              placeholder="Change First Name"
              name="first-name"
            />
            <input
              v-model="userInfo.lastName"
              type="text"
              placeholder="Change Last Name"
              name="last-name"
            />
          </div>
          <button
            class="bg-secondary text-white p-2 focus:outline-none"
            type="submit"
          >
            Save Info
          </button>
        </form>
        <form enctype="multipart/form-data" class="flex flex-col pt-2 w-full">
          <label class="pb-2">Profile Image:</label>
          <img :src="user.profile_pic" class="profile-picture" />
          <input id="profile-image-upload" type="file" accept="image/*" />
          <button
            type="button"
            class="bg-secondary text-white p-2 focus:outline-none"
            @click="upload"
          >
            Upload Image
          </button>
        </form>
        <form
          class="account-info-form flex flex-col pt-2 w-full"
          @submit.prevent="changeUserEmail"
        >
          <label class="pb-2">Change email:</label>
          <input
            v-model="userInfo.email"
            type="text"
            placeholder="Enter email"
            name="email"
          />
          <input
            v-model="userInfo.currentPassword"
            type="password"
            placeholder="Enter current password"
            name="current-password"
          />
          <button
            class="bg-secondary text-white p-2 focus:outline-none"
            type="submit"
          >
            Submit Email Change
          </button>
        </form>
        <form
          class="account-info-form flex flex-col pt-2 w-full"
          autocomplete="off"
          @submit.prevent="changePassword"
        >
          <label class="pb-2">Change password:</label>
          <input
            v-model="userInfo.oldPassword"
            type="password"
            placeholder="Enter old password"
            name="old-password"
          />
          <input
            v-model="userInfo.password"
            type="password"
            placeholder="Enter new password"
            name="new-password"
          />
          <input
            v-model="userInfo.passwordConfirm"
            type="password"
            placeholder="Confirm new password"
            name="confirm-password"
          />
          <button
            class="bg-secondary text-white p-2 focus:outline-none"
            type="submit"
          >
            Submit Password Change
          </button>
        </form>
      </div>
    </main>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'

import Nav from '~/components/Nav.vue'

export default {
  components: {
    Nav
  },
  data() {
    return {
      userInfo: {
        firstName: '',
        lastName: '',
        email: '',
        currentPassword: '',
        oldPassword: '',
        password: '',
        passwordConfirm: ''
      }
    }
  },
  computed: {
    ...mapGetters({
      user: 'users/getUser'
    })
  },
  methods: {
    changeUserInfo() {
      const currentUser = this.$fireAuth.currentUser
      const newFirstName = () => {
        if (this.userInfo.firstName === '') {
          const firstName = this.user.first_name || ''
          return firstName
        } else {
          return this.userInfo.firstName
        }
      }
      const newLastName = () => {
        if (this.userInfo.lastName === '') {
          const lastName = this.user.last_name || ''
          return lastName
        } else {
          return this.userInfo.lastName
        }
      }
      this.$fireStore
        .collection('users')
        .doc(currentUser.uid)
        .update({
          first_name: newFirstName(),
          last_name: newLastName()
        })
    },
    reauthenticate(oldPassword) {
      const currentUser = this.$fireAuth.currentUser
      const cred = this.$fireAuthObj.EmailAuthProvider.credential(
        currentUser.email,
        oldPassword
      )
      return currentUser.reauthenticateWithCredential(cred)
    },
    changePassword() {
      const errorMessages = []
      const messageContainer = document.querySelector(
        '#account-message-container'
      )
      if (this.userInfo.password.length < 6)
        errorMessages.push('New password must be 6 characters or more')
      if (this.userInfo.passwordConfirm === '')
        errorMessages.push('Please confirm your new password')
      if (this.userInfo.password !== this.userInfo.passwordConfirm)
        errorMessages.push('new passwords do not match')
      if (errorMessages.length > 0) {
        let li = ''
        errorMessages.forEach((message) => {
          li += `<li class="text-sm">${message}</li>`
        })
        messageContainer.innerHTML = li
        this.resetFields()
      } else {
        this.reauthenticate(this.userInfo.oldPassword)
          .then(() => {
            const currentUser = this.$fireAuth.currentUser
            currentUser
              .updatePassword(this.userInfo.password)
              .then(() => {
                messageContainer.innerHTML = `<li class="text-sm text-green-400">Successfully changed password!</li>`
                this.resetFields()
              })
              .catch((err) => {
                messageContainer.innerHTML = `<li class="text-sm">${err}</li>`
                this.resetFields()
              })
          })
          .catch((err) => {
            messageContainer.innerHTML = `<li class="text-sm">${err}</li>`
            this.resetFields()
          })
      }
    },
    changeUserEmail() {
      const messageContainer = document.querySelector(
        '#account-message-container'
      )
      this.reauthenticate(this.userInfo.currentPassword)
        .then(() => {
          const currentUser = this.$fireAuth.currentUser
          currentUser
            .updateEmail(this.userInfo.email)
            .then(() => {
              this.$fireStore
                .collection('users')
                .doc(currentUser.uid)
                .update({
                  email: this.userInfo.email
                })
              this.resetFields()
              messageContainer.innerHTML = `<li class="text-sm text-green-400">Successfully changed email!</li>`
            })
            .catch((err) => {
              messageContainer.innerHTML = `<li class="text-sm">${err}</li>`
            })
        })
        .catch((err) => {
          messageContainer.innerHTML = `<li class="text-sm">${err}</li>`
        })
    },
    upload() {
      const currentUser = this.$fireAuth.currentUser
      const userRef = this.$fireStore.collection('users').doc(currentUser.uid)
      const image = document.getElementById('profile-image-upload').files[0]
      const metadata = {
        contentType: 'image/jpeg'
      }
      // firebase storage reference
      const storageRef = this.$fireStorage.ref('profile/' + currentUser.uid)
      // Upload file
      const uploadTask = storageRef.put(image, metadata)

      // Listen for state changes, errors, and completion of the upload
      uploadTask.on(
        this.$fireStorageObj.TaskEvent.STATE_CHANGED,
        (snapshot) => {
          // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
          // const progress =
          //   (snapshot.byteTransferred / snapshot.totalBytes) * 100
          switch (snapshot.state) {
            case this.$fireStorageObj.TaskState.PAUSED:
              break
            case this.$fireStorageObj.TaskState.RUNNING:
              break
          }
        },
        (error) => {
          switch (error.code) {
            case 'storage/unauthorized':
              // User doesn't have permission to access the object
              break

            case 'storage/canceled':
              // User canceled the upload
              break

            case 'storage/unknown':
              // Unknown error occurred, inspect error.serverResponse
              break
          }
        },
        function() {
          // Upload completed successfully, now we can get the download URL
          uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
            userRef.update({
              profile_pic: downloadURL
            })
          })
        }
      )
    },
    resetFields() {
      this.userInfo.firstName = ''
      this.userInfo.lastName = ''
      this.userInfo.email = ''
      this.userInfo.currentPassword = ''
      this.userInfo.oldPassword = ''
      this.userInfo.password = ''
      this.userInfo.passwordConfirm = ''
    }
  }
}
</script>

<style lang="scss" scoped>
.account-settings-page {
  .profile-picture {
    width: 300px;
    height: 300px;
    object-fit: cover;
  }
  input {
    @apply border border-gray-300 p-2 mb-2;
  }
  input,
  button {
    width: 100%;
    max-width: 300px;
  }
}
</style>
