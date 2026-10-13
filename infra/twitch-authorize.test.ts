import { describe, expect, it } from 'vitest'
import { handler, TWITCH_CLAIMS } from './twitch-authorize'

describe('twitch authorize', () => {
  it("sends Cognito's request on to Twitch with the email claims", async () => {
    const response = await handler({
      rawQueryString:
        'client_id=abc&response_type=code&scope=openid+user%3Aread%3Aemail&redirect_uri=https%3A%2F%2Fauth.example.com%2Foauth2%2Fidpresponse&state=xyz',
    })
    expect(response.statusCode).toBe(302)
    const location = new URL(response.headers.location)
    expect(location.origin + location.pathname).toBe(
      'https://id.twitch.tv/oauth2/authorize',
    )
    expect(Object.fromEntries(location.searchParams)).toEqual({
      client_id: 'abc',
      response_type: 'code',
      scope: 'openid user:read:email',
      redirect_uri: 'https://auth.example.com/oauth2/idpresponse',
      state: 'xyz',
      claims: TWITCH_CLAIMS,
    })
  })

  it('replaces any claims sent along rather than adding to them', async () => {
    const response = await handler({ rawQueryString: 'claims=%7B%7D' })
    const location = new URL(response.headers.location)
    expect(location.searchParams.getAll('claims')).toEqual([TWITCH_CLAIMS])
  })

  it('only ever goes to Twitch', async () => {
    const response = await handler({
      rawQueryString: 'next=https%3A%2F%2Fevil.example',
    })
    expect(new URL(response.headers.location).host).toBe('id.twitch.tv')
  })
})
