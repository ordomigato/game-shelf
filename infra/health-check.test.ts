import { beforeEach, describe, expect, it, vi } from 'vitest'

const statements: { text: string; values: unknown[] }[] = []
let fail = false

vi.mock('@neondatabase/serverless', () => ({
  neon:
    () =>
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (fail) throw new Error('db down')
      statements.push({ text: strings.join('?'), values })
      return []
    },
}))
vi.mock('sst', () => ({ Resource: { DatabaseUrl: { value: 'postgres://x' } } }))
vi.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: vi.fn(),
  GetMetricStatisticsCommand: vi.fn(),
}))
vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(),
  DescribeUserPoolCommand: vi.fn(),
}))
vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: vi.fn(),
  PublishCommand: vi.fn(),
}))

const { pruneBarcodeCache } = await import('./health-check')

beforeEach(() => {
  statements.length = 0
  fail = false
})

describe('pruneBarcodeCache', () => {
  it('deletes only ScanDex rows with no match that are a day old', async () => {
    await pruneBarcodeCache()
    expect(statements).toHaveLength(1)
    const text = statements[0]!.text.replace(/\s+/g, ' ')
    expect(text).toContain('delete from barcode_lookups')
    expect(text).toContain("where source = 'scandex'")
    expect(text).toContain('and igdb_id is null')
    expect(text).toContain('fetched_at < now()')
    expect(statements[0]!.values).toEqual([24 * 60 * 60])
  })

  it('never names user rows, so every pick stays whatever its status', async () => {
    await pruneBarcodeCache()
    const text = statements[0]!.text
    expect(text).not.toContain("'user'")
    expect(text).not.toContain('status')
    expect(text).not.toContain('submitted_by')
  })

  it('only logs a failure', async () => {
    fail = true
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(pruneBarcodeCache()).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
