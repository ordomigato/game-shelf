import Cookie from 'js-cookie'

export const state = () => ({
  user: null,
  ownedGamesObjArray: [],
  wishlistGamesObjArray: [],
})

export const getters = {
  getUser: state => state.user,
  getBio: state => state.user.bio ? state.user.bio : '',
  getOwnedGames: state => state.user.owned_games ? state.user.owned_games : [],
  getWishlist: state => state.user.wishlist ? state.user.wishlist : [],
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
  },
  getGameObjects({ state, commit }) {
        // get owned games and wishlist from user
        let user = state.user
        console.log(user.owned_games)
        let { owned_games, wishlist } = user
        let gamesArray = []
        if (owned_games && owned_games.length > 0) gamesArray = gamesArray.concat(owned_games)
        if (wishlist && wishlist.length > 0) gamesArray = gamesArray.concat(wishlist)
        if (gamesArray && gamesArray.length > 0) {
          // create a query string to target all games and pull
          let query = this.$fireStore.collection('games').where(this.$fireStoreObj.FieldPath.documentId(), 'in', gamesArray)
          query.get().then(games => {
            // sort if game is owned or in wishlist
            let ownedGamesObjArray = []
            let wishlistGamesObjArray = []
            games.forEach(game => {
              let isOwned = owned_games.some(owned_game => owned_game == game.data().id)
              isOwned ? ownedGamesObjArray.push(game.data()) : wishlistGamesObjArray.push(game.data())
            })
            commit('setOwnedGamesObjArray', ownedGamesObjArray)
            commit('setWishlistGamesObjArray', wishlistGamesObjArray)
          })
        }
  }
}