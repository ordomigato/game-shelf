import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.stubGlobal('useAuth', () => ({ apiFetch }))

const { inRounds, useBarcodeReview } = await import('./useBarcodeReview')

const groups = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    code: `c${i}`,
    igdbId: i + 1,
    platformId: 130,
  }))

beforeEach(() => {
  apiFetch.mockReset()
})

describe('inRounds', () => {
  it('splits at 20', () => {
    expect(inRounds(groups(45)).map((r) => r.length)).toEqual([20, 20, 5])
    expect(inRounds(groups(20)).map((r) => r.length)).toEqual([20])
    expect(inRounds([])).toEqual([])
  })
})

describe('actInRounds', () => {
  it('posts one request per round of 20, one after another, and reports progress', async () => {
    const progress: number[] = []
    let running = 0
    let overlap = false
    apiFetch.mockImplementation(
      async (
        _url: string,
        options: { body: { action: string; groups: unknown[] } },
      ) => {
        running += 1
        overlap ||= running > 1
        await Promise.resolve()
        running -= 1
        return options.body.groups.map(() => ({ result: 'done' }))
      },
    )
    await useBarcodeReview().actInRounds(
      'approveAndSend',
      groups(45),
      (_outcomes, done) => progress.push(done),
    )
    const calls = apiFetch.mock.calls as [
      string,
      { body: { action: string; groups: unknown[] } },
    ][]
    expect(calls.map((call) => call[1].body.groups.length)).toEqual([20, 20, 5])
    expect(
      calls.every((call) => call[1].body.action === 'approveAndSend'),
    ).toBe(true)
    expect(progress).toEqual([20, 40, 45])
    expect(overlap).toBe(false)
  })

  it('stops at the first request that fails', async () => {
    apiFetch.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('x'))
    await expect(
      useBarcodeReview().actInRounds('reject', groups(60)),
    ).rejects.toThrow()
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })
})
