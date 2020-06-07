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
    if (state.showSignupModal === true) {
      state.showSignupModal = false
    }
  },
  setSignupModalOpenState (state, arg) {
    state.showSignupModal = arg 
    if (state.showLoginModal === true) {
      state.showLoginModal = false
    }
  },
  setSearchedGames (state, payload) {
    state.searchedGames = payload
  },
  clearSearchQuery (state) {
    state.searchedGames = []
  },
}

export const actions = {
  async searchForGame({commit}, queryString) {
    await this.$axios({
      method: 'POST',
      url: '/games/',
      headers: {
        "Accept": "application/json",
        "user-key": process.env.GAME_APP_ID,
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