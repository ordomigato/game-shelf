/** What a Lambda function URL request carries that we read. */
interface FunctionUrlEvent {
  rawQueryString?: string
}

/**
 * Asks Twitch for the email and whether it's verified. Twitch only puts
 * them in its tokens when the sign-in asks with a `claims` parameter.
 */
export const TWITCH_CLAIMS = JSON.stringify({
  id_token: { email: null, email_verified: null },
  userinfo: { email: null, email_verified: null },
})

/**
 * Cognito's authorize address for Twitch. Cognito can't add the `claims`
 * parameter Twitch needs for the email, and won't take an address with a
 * query in it, so it sends people here. This adds `claims` to Cognito's own
 * parameters and sends them on to Twitch, nowhere else. Twitch still checks
 * `redirect_uri` against the app's approved addresses.
 */
export async function handler(event: FunctionUrlEvent) {
  const params = new URLSearchParams(event.rawQueryString ?? '')
  params.set('claims', TWITCH_CLAIMS)
  return {
    statusCode: 302,
    headers: {
      location: `https://id.twitch.tv/oauth2/authorize?${params.toString()}`,
      'cache-control': 'no-store',
    },
  }
}
