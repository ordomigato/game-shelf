export const state = () => ({
  user: null,
  ownedGamesObjArray: [],
  wishlistGamesObjArray: [],
})

export const getters = {
  getUser: state => state.user,
  getOwnedGamesObjArray: state => state.ownedGamesObjArray ? state.ownedGamesObjArray : [],
  getWishlistGamesObjArray: state => state.wishlistGamesObjArray ? state.wishlistGamesObjArray : [],
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
  },
  setOwnedGamesObjArray (state, payload) {
    state.ownedGamesObjArray = payload
  },
  setWishlistGamesObjArray (state, payload) {
    state.wishlistGamesObjArray = payload
  },
}

export const actions = {
  login({}, user ) {
    return new Promise((resolve, reject) => {
      this.$fireAuth.signInWithEmailAndPassword(user.email, user.password).then(() => {
        resolve('Succesfully logged in!')
      }).catch(err => {
        reject(err)
      })
    })
  },
  onAuthStateChangedAction({ commit }, { authUser }) {
    if (!authUser) {
      console.log('user is logged out', authUser)
      commit('removeUser')
    } else {
      // Do something with the authUser and the claims object...
      console.log('user is logged in', authUser.uid)
      this.$fireStore.collection('users').doc(authUser.uid).onSnapshot( snapshot => {
        let userInfo = snapshot.data()
        commit('setUser', userInfo)
      })
    }
  },
  getLibrary({ commit }) {
    // get owned games
    const getUserLibrary = this.$fireFunc.httpsCallable('getUserLibrary')
    getUserLibrary({collection: 'owned_games'}).then(result => {
      commit('setOwnedGamesObjArray', result.data)
    })
  },
  getWishlist({ commit }) {
    // get wishlist
    const getUserLibrary = this.$fireFunc.httpsCallable('getUserLibrary')
    getUserLibrary({collection: 'wishlist'}).then(result => {
      commit('setWishlistGamesObjArray', result.data)
    })
  }
}