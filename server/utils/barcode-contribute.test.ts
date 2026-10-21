import { beforeEach, describe, expect, it, vi } from 'vitest'

const submitToScanDex = vi.fn()
vi.mock('./scandex', () => ({ submitToScanDex }))
vi.mock('./log', () => ({ log: vi.fn() }))

let unsent: string[]
let noMatch: string[]
const updates: unknown[] = []
let failUpdate = false

const { barcodeLookups, platforms, userBarcodes } = await import('../db/schema')

vi.stubGlobal('useDb', () => ({
  select: () => ({
    from: (table: unknown) => ({
      where: async () => {
        if (table === userBarcodes) return unsent.map((code) => ({ code }))
        if (table === barcodeLookups) return noMatch.map((code) => ({ code }))
        if (table === platforms) return [{ id: 130, name: 'Nintendo Switch' }]
        return []
      },
    }),
  }),
  update: () => ({
    set: (values: unknown) => ({
      where: async () => {
        if (failUpdate) throw new Error('db down')
        updates.push(values)
      },
    }),
  }),
}))

const { contributePicks } = await import('./barcode-contribute')

const CODE = '0045496590048'
const pick = { code: CODE, igdbId: 26758, platformId: 130 }
const names = new Map([[26758, 'Super Mario Odyssey']])

beforeEach(() => {
  unsent = [CODE]
  noMatch = [CODE]
  updates.length = 0
  failUpdate = false
  submitToScanDex.mockReset()
  submitToScanDex.mockResolvedValue(true)
})

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

  it('never sends a code twice', async () => {
    unsent = []
    await contributePicks('u1', [pick], names)
    expect(submitToScanDex).not.toHaveBeenCalled()
  })

  it('leaves the code unsent when ScanDex refuses, so a later add can try again', async () => {
    submitToScanDex.mockResolvedValue(false)
    await contributePicks('u1', [pick], names)
    expect(updates).toEqual([])
  })

  it('never throws, whatever fails', async () => {
    submitToScanDex.mockRejectedValue(new Error('boom'))
    await expect(contributePicks('u1', [pick], names)).resolves.toBeUndefined()
    submitToScanDex.mockResolvedValue(true)
    failUpdate = true
    await expect(contributePicks('u1', [pick], names)).resolves.toBeUndefined()
  })
})
