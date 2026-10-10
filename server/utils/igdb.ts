import { createError } from 'h3'
import { Resource } from 'sst'
import { log } from './log'
import { recordTiming } from './request-timing'

type IgdbEndpoint = 'games'

interface CachedToken {
  value: string
  expiresAt: number
}

/** Kept across warm Lambda invocations. */
let cachedToken: CachedToken | undefined

const TOKEN_EXPIRY_MARGIN_MS = 60 * 60 * 1000

/** IGDB responses slower than this are logged as `igdb.slow`. */
export const SLOW_IGDB_MS = 2000

const unavailable = () =>
  createError({ statusCode: 502, statusMessage: 'Game data unavailable' })

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value
  }

  let response: Response
  // Getting a token is part of talking to IGDB, so it counts as IGDB time.
  const started = Date.now()
  try {
    response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: Resource.TwitchClientId.value,
        client_secret: Resource.TwitchClientSecret.value,
        grant_type: 'client_credentials',
      }),
    })
  } catch (error) {
    log('error', 'twitch.unreachable', { message: String(error) })
    throw unavailable()
  } finally {
    recordTiming('igdb', Date.now() - started)
  }
  if (!response.ok) {
    log('error', 'twitch.token_failed', { status: response.status })
    throw unavailable()
  }

  const data = (await response.json()) as {
    access_token: string
    expires_in: number
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS,
  }
  log('info', 'twitch.token_fetched', {
    forced: forceRefresh,
    expiresInSeconds: data.expires_in,
  })
  return cachedToken.value
}

/**
 * Sends an Apicalypse query to IGDB. Retries once with a fresh token on 401.
 * Throws 503 when IGDB rate-limits us and 502 on any other failure, without
 * passing IGDB's response through to the browser. Failures, rate limits and
 * slow responses are logged with timings but never the query itself.
 */
export async function igdbRequest<T>(
  endpoint: IgdbEndpoint,
  query: string,
): Promise<T> {
  const send = async (token: string) => {
    const started = Date.now()
    try {
      const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
        method: 'POST',
        headers: {
          'Client-ID': Resource.TwitchClientId.value,
          Authorization: `Bearer ${token}`,
        },
        body: query,
      })
      const durationMs = Date.now() - started
      recordTiming('igdb', durationMs)
      return { response, durationMs }
    } catch (error) {
      log('error', 'igdb.unreachable', {
        endpoint,
        durationMs: Date.now() - started,
        message: String(error),
      })
      throw unavailable()
    }
  }

  let { response, durationMs } = await send(await getToken())
  if (response.status === 401) {
    log('warn', 'igdb.token_rejected', { endpoint })
    ;({ response, durationMs } = await send(await getToken(true)))
  }

  if (durationMs > SLOW_IGDB_MS) {
    log('warn', 'igdb.slow', { endpoint, status: response.status, durationMs })
  }
  if (response.status === 429) {
    log('warn', 'igdb.rate_limited', { endpoint, durationMs })
    throw createError({ statusCode: 503, statusMessage: 'Game data is busy' })
  }
  if (!response.ok) {
    log('error', 'igdb.request_failed', {
      endpoint,
      status: response.status,
      durationMs,
    })
    throw unavailable()
  }
  return (await response.json()) as T
}
