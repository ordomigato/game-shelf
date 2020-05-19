import JWTDecode from 'jwt-decode'
import cookieparser from 'cookieparser'

export const state = () => ({
  showLoginModal: false,
  showSignupModal: false,
  searchedGames: [],
})

export const getters = {
  getSearchedGames: state => state.searchedGames ? state.searchedGames : [],
}

export const mutations = {
  setLoginModalOpenState (state, arg) {
    state.showLoginModal = arg
  },
  setSignupModalOpenState (state, arg) {
    state.showSignupModal = arg
  },
  setSearchedGames (state, payload) {
    state.searchedGames = payload
  },
  clearSearchQuery (state) {
    state.searchedGames = []
  },
}

export const actions = {
  // Set user everytime server inits
  nuxtServerInit({commit}, { req }) {
    if(process.server && process.static) return
    if(!req.headers.cookie) return

    const parsed = cookieparser.parse(req.headers.cookie)
    const accessTokenCookie = parsed.access_token

    if(!accessTokenCookie) return

    const decoded =JWTDecode(accessTokenCookie)

    if(decoded) {
      commit('users/setUser', {
        uid: decoded.user_id,
        email: decoded.email
      })
    }
  },
  async searchForGame({commit}, queryString) {
    await this.$axios({
      method: 'POST',
      url: '/games/',
      headers: {
        "Accept": "application/json",
        "user-key": "df195682f272ee43531846b7dc35ef44",
      },
      data: `
        search: "${queryString}";
        fields: name, cover.image_id;
        limit: 500;
      `
    })
    .then(res => {
      // check if search returned no results
      if (res.data && res.data.length === 0) return
      // otherwise commit response
      commit('setSearchedGames', res.data)
    })
    .catch(err => {
      console.error(err);
    });
  }
}