import axios from 'axios'
import { EffectCoverflow } from 'swiper/js/swiper.esm'

export default({ store, app }, inject) =>  {
  inject('addGame', (gameObj) => {
    const addGame = app.$fireFunc.httpsCallable('addGame')

    // check if game exists in database already
    const gameRef = app.$fireStore.collection('games').doc(gameObj.id)

    gameRef.get().then(doc => {
      let updateStore = () => {
        // update store
        let gamesArray = store.getters['users/getOwnedGamesObjArray']
        let newGamesArray = [...gamesArray, gameObj]
        let wishlistArray = store.getters['users/getWishlistGamesObjArray']
        let newWishlistArray = wishlistArray.filter(game => game.id !== gameObj.id)
        
        store.commit('users/setWishlistGamesObjArray', newWishlistArray)
        store.commit('users/setOwnedGamesObjArray', newGamesArray);
      }

      if (doc.exists) {
        addGame({gameObj}).then(() => {
          updateStore()
        })
      } else {
        // add game data to firebase
        axios.get(`/games/${gameObj.id}?fields=*`)
          .then(response => {
            let data = response.data[0]
            data.image_id = gameObj.image_url
            gameRef.set(
              data
            )
            .then(() => {
              addGame({gameObj}).then(() => {
                // get current list of owned_games and add in the new game
                updateStore()
              })
            })
            .catch(err => {
              console.log(err)
            })
          })
          .catch(err => {
            console.log(err)
          })
      }
    })
  }),
  inject('removeGame', (gameObj) => {
    const removeGame = app.$fireFunc.httpsCallable('removeGame')
    removeGame({gameObj}).then(() => {
      // get current list of owned_games and add in the new game
      let gamesArray = store.getters['users/getOwnedGamesObjArray']
      let newGamesArray = gamesArray.filter(game => game.id !== gameObj.id)
      store.commit('users/setOwnedGamesObjArray', newGamesArray)
    })

  }),
  inject('addToWishlist', (gameObj) => {
    const addToWishlist = app.$fireFunc.httpsCallable('addToWishlist')

    // check if game exists in database already
    const gameRef = app.$fireStore.collection('games').doc(gameObj.id)

    gameRef.get().then(doc => {

      let updateStore = () => {
        // update store
        let wishlistArray = store.getters['users/getWishlistGamesObjArray']
        let newWishlistArray = [...wishlistArray, gameObj]
        let gamesArray = store.getters['users/getOwnedGamesObjArray']
        let newGamesArray = gamesArray.filter(game => game.id !== gameObj.id)
        
        store.commit('users/setWishlistGamesObjArray', newWishlistArray)
        store.commit('users/setOwnedGamesObjArray', newGamesArray);
      }

      if (doc.exists) {
        addToWishlist({gameObj}).then(() => {
          updateStore()
        })
      } else {
        // add game to firebase
        axios.get(`/games/${gameObj.id}?fields=*`)
          .then( response => {
            let data = response.data[0]
            data.image_id = gameObj.image_url
            gameRef.set(
              data
            )
            .then(() => {
              addToWishlist({gameObj}).then(() => {
                updateStore()
              })
            })
            .catch(err => {
              console.log(err)
            })
          })
      }
    })
  }),
  inject('removeFromWishlist', (gameObj) => {
    const removeFromWishlist = app.$fireFunc.httpsCallable('removeFromWishlist')
    removeFromWishlist({gameObj}).then(() => {
      // get current list of owned_games and add in the new game
      let gamesArray = store.getters['users/getWishlistGamesObjArray']
      let newGamesArray = gamesArray.filter(game => game.id !== gameObj.id)
      store.commit('users/setWishlistGamesObjArray', newGamesArray)
    })
  })

}