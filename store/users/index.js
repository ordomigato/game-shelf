import Cookie from 'js-cookie'

export const state = () => ({
  user: null
})

export const getters = {
  getUser: state => state.user,
  getOwnedGames: state => state.user.owned_games ? state.user.owned_games : [],
  getWishlist: state => state.user.wishlist ? state.user.wishlist : [],
  getJoinedDate: state => {
    const joinedDateObj = state.user.joined
    if (!joinedDateObj) return
    const monthsArray = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const joinedDate = `${monthsArray[joinedDateObj.month]} ${joinedDateObj.day}, ${joinedDateObj.year}`
    return joinedDate
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
  async login({}, user ) {
    try {
      // login the user
      await this.$fireAuth.signInWithEmailAndPassword(user.email, user.password)
      // Get JWT from firebase
      const token = await this.$fireAuth.currentUser.getIdToken()
      // Set JWT to the token
      Cookie.set('access_token', token)
    }catch(err) {
      console.log(err)
    }
  },
  onAuthStateChangedAction({ commit }, { authUser }) {
    if (!authUser) {
      console.log('user is logged out')
      commit('removeUser')
    } else {
      // Do something with the authUser and the claims object...
      console.log('user is logged in')
      this.$fireStore.collection('users').doc(authUser.uid).onSnapshot( snapshot => {
        let userInfo = snapshot.data()
        commit('setUser', userInfo)
      })
    }
  }
}