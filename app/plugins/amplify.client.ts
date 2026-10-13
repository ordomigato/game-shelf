import { Amplify } from 'aws-amplify'
// Finishes a social sign-in when Cognito sends the browser back.
import 'aws-amplify/auth/enable-oauth-listener'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognitoUserPoolId,
        userPoolClientId: config.cognitoClientId,
        loginWith: {
          email: true,
          // Social logins go through Cognito's pages and come back here.
          ...(config.cognitoDomain && {
            oauth: {
              domain: config.cognitoDomain,
              scopes: ['openid', 'email', 'profile'],
              redirectSignIn: [`${window.location.origin}/auth/callback`],
              redirectSignOut: [`${window.location.origin}/`],
              responseType: 'code' as const,
            },
          }),
        },
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
