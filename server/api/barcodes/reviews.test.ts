import { beforeEach, describe, expect, it, vi } from 'vitest'

const reviewGroups = vi.fn()
const listReviewGroups = vi.fn()
vi.mock('../../utils/scandex', () => ({ submitToScanDex: vi.fn() }))

let reviews: boolean
const requireAuth = vi.fn(async () => ({ sub: 'sub-1' }))
const findOrCreateUser = vi.fn(async () => ({
  id: 'u1',
  reviewsBarcodes: reviews,
}))
let body: unknown
let query: unknown

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('requireAuth', requireAuth)
vi.stubGlobal('findOrCreateUser', findOrCreateUser)
vi.stubGlobal(
  'readValidatedBody',
  async (_event: unknown, parse: (value: unknown) => unknown) => parse(body),
)
vi.stubGlobal(
  'getValidatedQuery',
  async (_event: unknown, parse: (value: unknown) => unknown) => parse(query),
)

// The routes use Nitro's auto-imports. The gate is the real one.
const { requireReviewer } = await import('../../utils/barcode-review')
vi.stubGlobal('requireReviewer', requireReviewer)
vi.stubGlobal('listReviewGroups', listReviewGroups)
vi.stubGlobal('reviewGroups', reviewGroups)

const get = (await import('./reviews.get')).default as (
  event: unknown,
) => Promise<unknown>
const post = (await import('./reviews.post')).default as (
  event: unknown,
) => Promise<unknown>

const group = { code: '0045496590048', igdbId: 26758, platformId: 130 }

beforeEach(() => {
  reviews = true
  query = {}
  body = { action: 'approve', groups: [group] }
  listReviewGroups.mockReset()
  listReviewGroups.mockResolvedValue([])
  reviewGroups.mockReset()
  reviewGroups.mockResolvedValue([])
})

describe('GET /api/barcodes/reviews', () => {
  it('is a 404 for an account that does not review barcodes, without reading anything', async () => {
    reviews = false
    await expect(get({})).rejects.toMatchObject({ statusCode: 404 })
    expect(listReviewGroups).not.toHaveBeenCalled()
  })

  it('lists pending picks unless told otherwise', async () => {
    listReviewGroups.mockResolvedValue([{ code: group.code }])
    expect(await get({})).toEqual([{ code: group.code }])
    expect(listReviewGroups).toHaveBeenCalledWith('pending')
    query = { status: 'rejected' }
    await get({})
    expect(listReviewGroups).toHaveBeenLastCalledWith('rejected')
  })

  it('refuses a status that does not exist', async () => {
    query = { status: 'everything' }
    await expect(get({})).rejects.toThrow()
    expect(listReviewGroups).not.toHaveBeenCalled()
  })
})

describe('POST /api/barcodes/reviews', () => {
  it('is a 404 for an account that does not review barcodes, without doing anything', async () => {
    reviews = false
    await expect(post({})).rejects.toMatchObject({ statusCode: 404 })
    expect(reviewGroups).not.toHaveBeenCalled()
  })

  it('does not even read the body for anyone else', async () => {
    reviews = false
    body = 'not even a body'
    await expect(post({})).rejects.toMatchObject({ statusCode: 404 })
  })

  it.each(['approve', 'approveAndSend', 'reject', 'send'])(
    'does %s for the reviewer and returns each outcome',
    async (action) => {
      body = { action, groups: [group] }
      const outcomes = [{ ...group, result: 'done' }]
      reviewGroups.mockResolvedValue(outcomes)
      expect(await post({})).toEqual(outcomes)
      expect(reviewGroups).toHaveBeenCalledWith(action, [group])
    },
  )

  it('takes between 1 and 20 groups and a known action', async () => {
    body = { action: 'approve', groups: Array(21).fill(group) }
    await expect(post({})).rejects.toThrow()
    body = { action: 'approve', groups: [] }
    await expect(post({})).rejects.toThrow()
    body = { action: 'delete', groups: [group] }
    await expect(post({})).rejects.toThrow()
    expect(reviewGroups).not.toHaveBeenCalled()
  })
})
