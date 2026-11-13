import { describe, expect, it } from 'vitest'
import { followErrorMessage } from './follow-errors'

const refusal = (statusCode: number, data?: unknown) => ({ statusCode, data })

describe('followErrorMessage', () => {
  it('names the limit, with separators', () => {
    expect(
      followErrorMessage(
        refusal(403, {
          data: { key: 'follows.limitReached', params: { limit: 2000 } },
        }),
      ),
    ).toEqual({ key: 'follows.limitReached', params: { limit: '2,000' } })
    expect(
      followErrorMessage(
        refusal(403, {
          data: { key: 'follows.blockLimitReached', params: { limit: 500 } },
        }),
      ).key,
    ).toBe('follows.blockLimitReached')
  })

  it('tells someone to unblock before following', () => {
    expect(followErrorMessage(refusal(409)).key).toBe('follows.unblockFirst')
  })

  it('asks for patience when rate limited', () => {
    expect(followErrorMessage(refusal(429)).key).toBe('follows.tooMany')
  })

  it('falls back to a plain failure', () => {
    expect(followErrorMessage(refusal(500)).key).toBe('follows.failed')
    expect(followErrorMessage(undefined).key).toBe('follows.failed')
  })
})
