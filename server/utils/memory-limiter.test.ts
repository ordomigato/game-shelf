import { describe, expect, it } from 'vitest'
import { createMemoryLimiter } from './memory-limiter'

function setup(maxKeys?: number) {
  let time = 1_000_000
  const limiter = createMemoryLimiter({ maxKeys, now: () => time })
  return { limiter, advance: (ms: number) => (time += ms) }
}

describe('createMemoryLimiter', () => {
  it('allows up to the limit in a window, then refuses', () => {
    const { limiter } = setup()
    for (let i = 0; i < 3; i++) {
      expect(limiter.hit('a', 3, 60_000).allowed).toBe(true)
    }
    expect(limiter.hit('a', 3, 60_000).allowed).toBe(false)
  })

  it('says how many seconds are left in the window', () => {
    const { limiter, advance } = setup()
    limiter.hit('a', 1, 60_000)
    advance(20_500)
    expect(limiter.hit('a', 1, 60_000)).toEqual({
      allowed: false,
      retryAfter: 40,
    })
  })

  it('starts a fresh window once the old one ends', () => {
    const { limiter, advance } = setup()
    limiter.hit('a', 1, 60_000)
    expect(limiter.hit('a', 1, 60_000).allowed).toBe(false)
    advance(60_000)
    expect(limiter.hit('a', 1, 60_000).allowed).toBe(true)
  })

  it('counts each key on its own', () => {
    const { limiter } = setup()
    limiter.hit('a', 1, 60_000)
    expect(limiter.hit('a', 1, 60_000).allowed).toBe(false)
    expect(limiter.hit('b', 1, 60_000).allowed).toBe(true)
  })

  it('drops expired keys first when full', () => {
    const { limiter, advance } = setup(3)
    limiter.hit('old', 1, 10_000)
    advance(5_000)
    limiter.hit('b', 1, 60_000)
    limiter.hit('c', 1, 60_000)
    advance(6_000)
    limiter.hit('d', 1, 60_000)
    expect(limiter.size).toBe(3)
    // "b" and "c" kept their counts, so they're still refused.
    expect(limiter.hit('b', 1, 60_000).allowed).toBe(false)
    expect(limiter.hit('c', 1, 60_000).allowed).toBe(false)
  })

  it('never grows past the cap, dropping the oldest keys', () => {
    const { limiter } = setup(100)
    for (let i = 0; i < 1000; i++) limiter.hit(`ip${i}`, 5, 60_000)
    expect(limiter.size).toBe(100)
    // The newest key is still counted.
    limiter.hit('ip999', 1, 60_000)
    expect(limiter.hit('ip999', 1, 60_000).allowed).toBe(false)
  })
})
