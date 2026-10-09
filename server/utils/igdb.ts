import { Resource } from 'sst'

type IgdbEndpoint = 'games'

interface CachedToken {
  value: string
  expiresAt: number
}

/** Kept across warm Lambda invocations. */
let cachedToken: CachedToken | undefined

const TOKEN_EXPIRY_MARGIN_MS = 60 * 60 * 1000

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value
  }

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: Resource.TwitchClientId.value,
      client_secret: Resource.TwitchClientSecret.value,
      grant_type: 'client_credentials',
    }),
  })
  if (!response.ok) {
    console.error('Twitch token request failed', response.status)
    throw createError({
      statusCode: 502,
      statusMessage: 'Game data unavailable',
    })
  }

  const data = (await response.json()) as {
    access_token: string
    expires_in: number
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS,
  }
  return cachedToken.value
}

/**
 * Sends an Apicalypse query to IGDB. Retries once with a fresh token on 401.
 * Throws 503 when IGDB rate-limits us and 502 on any other failure, without
 * passing IGDB's response through to the browser.
 */
export async function igdbRequest<T>(
  endpoint: IgdbEndpoint,
  query: string,
): Promise<T> {
  const send = async (token: string) =>
    fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': Resource.TwitchClientId.value,
        Authorization: `Bearer ${token}`,
      },
      body: query,
    })

  let response = await send(await getToken())
  if (response.status === 401) {
    response = await send(await getToken(true))
  }

  if (response.status === 429) {
    throw createError({ statusCode: 503, statusMessage: 'Game data is busy' })
  }
  if (!response.ok) {
    console.error('IGDB request failed', endpoint, response.status)
    throw createError({
      statusCode: 502,
      statusMessage: 'Game data unavailable',
    })
  }
  return (await response.json()) as T
}
