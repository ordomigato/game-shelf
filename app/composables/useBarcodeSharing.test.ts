import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.stubGlobal('useAuth', () => ({ apiFetch }))

const { inRounds, useBarcodeSharing } = await import('./useBarcodeSharing')

const codes = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`)

beforeEach(() => {
  apiFetch.mockReset()
})

describe('inRounds', () => {
  it('splits at 20', () => {
    expect(inRounds(codes(45)).map((r) => r.length)).toEqual([20, 20, 5])
    expect(inRounds(codes(20)).map((r) => r.length)).toEqual([20])
    expect(inRounds([])).toEqual([])
  })
})

describe('sendInRounds', () => {
  it('posts one request per round of 20, one after another, and reports progress', async () => {
    const progress: number[] = []
    let running = 0
    let overlap = false
    apiFetch.mockImplementation(
      async (_url: string, options: { body: { codes: string[] } }) => {
        running += 1
        overlap ||= running > 1
        await Promise.resolve()
        running -= 1
        return options.body.codes.map((code) => ({ code, result: 'sent' }))
      },
    )
    await useBarcodeSharing().sendInRounds(codes(45), (_results, done) =>
      progress.push(done),
    )
    const sizes = (
      apiFetch.mock.calls as [string, { body: { codes: string[] } }][]
    ).map((call) => call[1].body.codes.length)
    expect(sizes).toEqual([20, 20, 5])
    expect(progress).toEqual([20, 40, 45])
    expect(overlap).toBe(false)
  })

  it('stops at the first request that fails', async () => {
    apiFetch.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('x'))
    await expect(useBarcodeSharing().sendInRounds(codes(60))).rejects.toThrow()
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })
})
