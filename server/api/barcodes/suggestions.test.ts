import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendSuggestions = vi.fn()
const listSuggestions = vi.fn()
vi.mock('../../utils/scandex', () => ({ submitToScanDex: vi.fn() }))

let contributes: boolean
const requireAuth = vi.fn(async () => ({ sub: 'sub-1' }))
const findOrCreateUser = vi.fn(async () => ({
  id: 'u1',
  contributesBarcodes: contributes,
}))
let body: unknown

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requireAuth', requireAuth)
vi.stubGlobal('findOrCreateUser', findOrCreateUser)
vi.stubGlobal(
  'readValidatedBody',
  async (_event: unknown, parse: (value: unknown) => unknown) => parse(body),
)

// The routes use Nitro's auto-imports. The gate is the real one.
const { requireContributor } = await import('../../utils/barcode-contribute')
vi.stubGlobal('requireContributor', requireContributor)
vi.stubGlobal('listSuggestions', listSuggestions)
vi.stubGlobal('sendSuggestions', sendSuggestions)

const get = (await import('./suggestions.get')).default as (
  event: unknown,
) => Promise<unknown>
const post = (await import('./suggestions.post')).default as (
  event: unknown,
) => Promise<unknown>

beforeEach(() => {
  contributes = true
  body = { codes: ['0045496590048'] }
  listSuggestions.mockReset()
  listSuggestions.mockResolvedValue([])
  sendSuggestions.mockReset()
  sendSuggestions.mockResolvedValue([])
})

describe('GET /api/barcodes/suggestions', () => {
  it('is a 404 for an account that is not allowed to share, without reading anything', async () => {
    contributes = false
    await expect(get({})).rejects.toMatchObject({ statusCode: 404 })
    expect(listSuggestions).not.toHaveBeenCalled()
  })

  it('lists the user’s own picks for an allowed account', async () => {
    listSuggestions.mockResolvedValue([{ code: '0045496590048' }])
    expect(await get({})).toEqual([{ code: '0045496590048' }])
    expect(listSuggestions).toHaveBeenCalledWith('u1')
  })
})

describe('POST /api/barcodes/suggestions', () => {
  it('is a 404 for an account that is not allowed to share, without sending anything', async () => {
    contributes = false
    await expect(post({})).rejects.toMatchObject({ statusCode: 404 })
    expect(sendSuggestions).not.toHaveBeenCalled()
  })

  it('sends the chosen codes for an allowed account and returns each result', async () => {
    const results = [
      { code: '0045496590048', result: 'failed', status: 400, message: 'No' },
    ]
    sendSuggestions.mockResolvedValue(results)
    expect(await post({})).toEqual(results)
    expect(sendSuggestions).toHaveBeenCalledWith('u1', ['0045496590048'])
  })

  it('takes at most 20 codes and at least one', async () => {
    body = { codes: Array.from({ length: 21 }, (_, i) => String(i)) }
    await expect(post({})).rejects.toThrow()
    body = { codes: [] }
    await expect(post({})).rejects.toThrow()
    expect(sendSuggestions).not.toHaveBeenCalled()
  })
})
