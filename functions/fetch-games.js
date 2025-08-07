let tokenCache = {
  value: null,
  expires: 0,
}

export async function handler(event) {
  const now = Date.now()

  if (!tokenCache.value || now >= tokenCache.expires) {
    const authRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    })

    const data = await authRes.json()
    tokenCache.value = data.access_token
    tokenCache.expires = now + data.expires_in * 1000 - 60_000
  }

  const body = event.body // raw query string from client

  const igdbRes = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${tokenCache.value}`,
    },
    body,
  })

  const igdbData = await igdbRes.text() // IGDB returns raw text, not JSON if there's a syntax error

  return {
    statusCode: 200,
    body: igdbData,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  }
}
