import axios from 'axios'
import { EffectCoverflow } from 'swiper/js/swiper.esm'

export default({ app }, inject) =>  {
  inject('addGame', (gameId, gameImageId) => {
    const addGame = app.$fireFunc.httpsCallable('addGame')

    // check if game exists in database already
    const gameRef = app.$fireStore.collection('games').doc(gameId)

    gameRef.get().then(doc => {
      if (doc.exists) {
        addGame({id: gameId}).then(result => {
          return result.data
        })
      } else {
        // add game data to firebase
        axios.get(`/games/${gameId}?fields=*`)
          .then(response => {
            let data = response.data[0]
            data.image_id = gameImageId
            gameRef.set(
              data
            )
            .then(() => {
              addGame({id: gameId}).then(result => {
                return result.data
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
  inject('addToWishlist', (gameId, gameImageId) => {
    const addToWishlist = app.$fireFunc.httpsCallable('addToWishlist')

    // check if game exists in database already
    const gameRef = app.$fireStore.collection('games').doc(gameId)

    gameRef.get().then(doc => {
      if (doc.exists) {
        addToWishlist({id: gameId}).then(result => {
          return result.data
        })
      } else {
        // add game to firebase
        axios.get(`/games/${gameId}?fields=*`)
          .then( response => {
            let data = response.data[0]
            data.image_id = gameImageId
            gameRef.set(
              data
            )
            .then(() => {
              addToWishlist({id: gameId}).then(result => {
                return result.data
              })
            })
            .catch(err => {
              console.log(err)
            })
          })
      }
    })
  })

    // add game reference to users owned_games array
  //   if(userId == null || userId == undefined) {
  //     console.log('user ID is not available')
  //   }
  //   app.$fireStore.collection('users').doc(userId).update({
  //     wishlist: app.$fireStoreObj.FieldValue.arrayUnion(gameId)
  //   })
  //   // check if game exists in database already
  //   const gameRef = app.$fireStore.collection('games').doc(gameId)
  //   gameRef.get()
  //     .then(docSnapshot => {
  //       if (docSnapshot.exists) {
  //         return
  //       } else {
  //         // add game data to firebase
  //         axios.get(`/games/${gameId}?fields=*`)
  //           .then(response => {
  //             let data = response.data[0]
  //             data.image_id = gameImageId
  //             gameRef.set(
  //               data
  //             )
  //           })
  //           .catch(err => {
  //             console.log(err)
  //           })
  //       }
  //     })
  // }),
}