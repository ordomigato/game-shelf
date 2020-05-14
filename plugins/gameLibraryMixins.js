import axios from 'axios'
import { EffectCoverflow } from 'swiper/js/swiper.esm'

export default({ app }, inject) =>  {
  inject('addGame', (gameId, gameImageId) => {
    let userId = app.store.state.users.user.uid
    // add game reference to users owned_games array
    if(userId == null || userId == undefined) {
      console.log('user ID is not available')
    }
    app.$fireStore.collection('users').doc(userId).update({
      owned_games: app.$fireStoreObj.FieldValue.arrayUnion(gameId),
      // remove game from wishlist if there
      wishlist: app.$fireStoreObj.FieldValue.arrayRemove(gameId)
    })
    // check if game exists in database already
    const gameRef = app.$fireStore.collection('games').doc(gameId)

    gameRef.get()
      .then(docSnapshot => {
        if (docSnapshot.exists) {
          return
        } else {
          // add game data to firebase
          axios.get(`/games/${gameId}?fields=*`)
            .then(response => {
              let data = response.data[0]
              data.image_id = gameImageId
              gameRef.set(
                data
              )
            })
            .catch(err => {
              console.log(err)
            })
        }
      })
  }),
  inject('removeGame', gameId => {
    let userId = app.store.state.users.user.uid
    // remove game reference from used owned_games array
    if(userId == null || userId == undefined) {
      console.log('user ID is not available')
    }
    app.$fireStore.collection('users').doc(userId).update({
      owned_games: app.$fireStoreObj.FieldValue.arrayRemove(gameId)
    })
    // remove game from database
    const gameRef = app.$fireStore.collection('games').doc(gameId)

    gameRef.update({
      owned_games: app.$fireStoreObj.FieldValue.arrayRemove(gameId)
    })
  }),
  inject('addToWishlist', (gameId, gameImageId) => {
    let userId = app.store.state.users.user.uid
    // add game reference to users owned_games array
    if(userId == null || userId == undefined) {
      console.log('user ID is not available')
    }
    app.$fireStore.collection('users').doc(userId).update({
      wishlist: app.$fireStoreObj.FieldValue.arrayUnion(gameId)
    })
    // check if game exists in database already
    const gameRef = app.$fireStore.collection('games').doc(gameId)

    gameRef.get()
      .then(docSnapshot => {
        if (docSnapshot.exists) {
          return
        } else {
          // add game data to firebase
          axios.get(`/games/${gameId}?fields=*`)
            .then(response => {
              let data = response.data[0]
              data.image_id = gameImageId
              gameRef.set(
                data
              )
            })
            .catch(err => {
              console.log(err)
            })
        }
      })
  }),
  inject('removeFromWishlist', gameId => {
    let userId = app.store.state.users.user.uid
    // remove game reference from used owned_games array
    if(userId == null || userId == undefined) {
      console.log('user ID is not available')
    }
    app.$fireStore.collection('users').doc(userId).update({
      wishlist: app.$fireStoreObj.FieldValue.arrayRemove(gameId)
    })
  })
}