import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const submitToScanDex = vi.fn()
vi.mock('./scandex', () => ({ submitToScanDex }))
const log = vi.fn()
vi.mock('./log', () => ({ log }))

/** Codes nobody has claimed yet. */
let unclaimed: string[]
let noMatch: string[]
let updates: Record<string, unknown>[]
let failClaim = false

const { PgDialect } = await import('drizzle-orm/pg-core')
const { barcodeLookups, platforms } = await import('../db/schema')

vi.stubGlobal('useDb', () => ({
  select: () => ({
    from: (table: unknown) => ({
      where: async () => {
        if (table === barcodeLookups) return noMatch.map((code) => ({ code }))
        if (table === platforms) return [{ id: 130, name: 'Nintendo Switch' }]
        return []
      },
    }),
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: (condition: never) => {
        updates.push(values)
        const done = Promise.resolve()
        return Object.assign(done, {
          // Claims only the codes asked for that nobody has claimed.
          returning: async () => {
            if (failClaim) throw new Error('db down')
            const { params } = new PgDialect().sqlToQuery(condition)
            const claimed = unclaimed.filter((code) => params.includes(code))
            unclaimed = unclaimed.filter((code) => !claimed.includes(code))
            return claimed.map((code) => ({ code }))
          },
        })
      },
    }),
  }),
}))

const { contributePicks } = await import('./barcode-contribute')

const CODE = '0045496590048'
const pick = { code: CODE, igdbId: 26758, platformId: 130 }
const names = new Map([[26758, 'Super Mario Odyssey']])

beforeEach(() => {
  unclaimed = [CODE]
  noMatch = [CODE]
  updates = []
  failClaim = false
  log.mockReset()
  submitToScanDex.mockReset()
  submitToScanDex.mockResolvedValue(true)
})

afterEach(() => vi.useRealTimers())

describe('contributePicks', () => {
  it('sends a pick with a platform for a box ScanDex did not know, with names from our catalog', async () => {
    await contributePicks('u1', [pick], names)
    expect(submitToScanDex).toHaveBeenCalledOnce()
    const sent = submitToScanDex.mock.calls[0]![0]
    expect(sent).toEqual({
      igdbId: 26758,
      platformId: 130,
      platform: 'Nintendo Switch',
      name: 'Super Mario Odyssey',
      value: 45496590048,
    })
    expect(typeof sent.value).toBe('number')
    expect(typeof sent.platformId).toBe('number')
    // Claimed once, and kept claimed because the send worked.
    expect(updates).toEqual([{ submittedAt: expect.any(Date) }])
  })

  it('never sends a pick with no platform', async () => {
    await contributePicks('u1', [{ ...pick, platformId: null }], names)
    expect(submitToScanDex).not.toHaveBeenCalled()
  })

  it('never sends a Change on a box ScanDex matched', async () => {
    noMatch = []
    await contributePicks('u1', [pick], names)
    expect(submitToScanDex).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('never sends a code that is already claimed, so two requests send it once', async () => {
    await Promise.all([
      contributePicks('u1', [pick], names),
      contributePicks('u1', [pick], names),
    ])
    expect(submitToScanDex).toHaveBeenCalledOnce()
  })

  it('gives the code back when ScanDex refuses, so a later add can try again', async () => {
    submitToScanDex.mockResolvedValue(false)
    await contributePicks('u1', [pick], names)
    expect(updates).toEqual([
      { submittedAt: expect.any(Date) },
      { submittedAt: null },
    ])
  })

  it('sends at most 20 in one request', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...pick,
      code: String(4549659000000 + i),
    }))
    unclaimed = many.map((p) => p.code)
    noMatch = [...unclaimed]
    await contributePicks('u1', many, names)
    expect(submitToScanDex).toHaveBeenCalledTimes(20)
  })

  it('gives up after 3 seconds in total and gives the claim back', async () => {
    vi.useFakeTimers()
    submitToScanDex.mockReturnValue(new Promise(() => {}))
    const done = contributePicks('u1', [pick], names)
    await vi.advanceTimersByTimeAsync(3000)
    await done
    expect(updates.at(-1)).toEqual({ submittedAt: null })
  })

  it('never throws and never logs the database’s error', async () => {
    failClaim = true
    await expect(contributePicks('u1', [pick], names)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith('warn', 'barcode.suggest_failed', {
      status: -1,
      error: 'Error',
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain(CODE)
  })
})
