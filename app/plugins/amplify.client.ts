import { Amplify } from 'aws-amplify'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognitoUserPoolId,
        userPoolClientId: config.cognitoClientId,
        loginWith: { email: true },
      },
    },
  })
  // Checking the session changes auth state, so on server-rendered pages it
  // waits until hydration is done. Otherwise a fast check could change the
  // header before Vue has matched it to the server's HTML.
  onNuxtReady(() => {
    void useAuth().ensureLoaded()
  })
})
