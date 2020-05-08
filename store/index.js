import JWTDecode from 'jwt-decode'
import cookieparser from 'cookieparser'

export const state = () => ({
  showLoginModal: false,
  showSignupModal: false,
})

export const mutations = {
  setLoginModalOpenState (state, arg) {
    state.showLoginModal = arg
  },
  setSignupModalOpenState (state, arg) {
    state.showSignupModal = arg
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
  }
}