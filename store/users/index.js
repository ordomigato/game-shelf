import Cookie from 'js-cookie'

export const state = () => ({
  user: null
})

export const getters = {
  getUser: state => state.user,
  getOwnedGames: state => {
    if(!state.user.owned_games) {
      return 0
    } else {
      return state.user.owned_games
    }
  }
}

export const mutations = {
  setUser (state, user) {
    state.user = user
  },
  removeUser (state) {
    state.user = null
  }
}

export const actions = {
  async login({ commit }, user) {
    try {
      // login the user
      await this.$fireAuth.signInWithEmailAndPassword(user.email, user.password)
      
      // Get JWT from firebase
      const token = await this.$fireAuth.currentUser.getIdToken()
      const { uid } = await this.$fireAuth.currentUser

      // Set JWT to the token
      Cookie.set('access_token', token)

      // grab user info from firestore
      await this.$fireStore.collection('users').doc(uid).onSnapshot( snapshot => {
        let userInfo = snapshot.data()
        commit('setUser', userInfo )
      })
    }catch(err) {
      console.log(err)
    }
  },
  onAuthStateChangedAction: (ctx, { authUser, claims }) => {
    if (!authUser) {
      console.log('user is logged out')
    } else {
      // Do something with the authUser and the claims object...
      console.log('user is logged in')
    }
  }
}