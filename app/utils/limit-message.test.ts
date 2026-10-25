import { describe, expect, it } from 'vitest'
import { limitMessage } from './limit-message'

const t = (key: string, params: Record<string, unknown>) =>
  `${key} ${JSON.stringify(params)}`

const refusal = (key: string, params: Record<string, unknown>) => ({
  data: { data: { key, params } },
})

describe('limitMessage', () => {
  it('formats numbers in the refusal with thousands separators', () => {
    expect(
      limitMessage(
        refusal('limits.reached.gamesPerCollection', { limit: 1000 }),
        t,
      ),
    ).toBe('limits.reached.gamesPerCollection {"limit":"1,000"}')
  })

  it('leaves other params as they are', () => {
    expect(
      limitMessage(refusal('limits.reached.fields', { name: 'Price' }), t),
    ).toBe('limits.reached.fields {"name":"Price"}')
  })

  it('returns null for an error that is not a limit refusal', () => {
    expect(limitMessage(refusal('something.else', {}), t)).toBeNull()
    expect(limitMessage(new Error('boom'), t)).toBeNull()
  })
})
