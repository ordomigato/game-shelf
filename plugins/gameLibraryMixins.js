import axios from 'axios'

export default({ app }, inject) =>  {
  inject('addGame', gameId => {
    let userId = app.store.state.users.user.uid
    // add game reference to users owned_games array
    if(userId == null || userId == undefined) {
      console.log('user ID is not available')
    }
    app.$fireStore.collection('users').doc(userId).update({
      owned_games: 	app.$fireStoreObj.FieldValue.arrayUnion(gameId)
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
              gameRef.set(
                response.data[0]
              )
            })
            .catch(err => {
              console.log(err)
            })
        }
      })
  })
}