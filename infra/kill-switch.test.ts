import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent: { name: string; input: Record<string, unknown> }[] = []
let enabled = true

vi.mock('@aws-sdk/client-cloudfront', () => {
  const command = (name: string) =>
    class {
      constructor(public input: Record<string, unknown>) {
        Object.assign(this, { name })
      }
    }
  return {
    GetDistributionConfigCommand: command('GetDistributionConfig'),
    UpdateDistributionCommand: command('UpdateDistribution'),
    CloudFrontClient: class {
      async send(cmd: { name: string; input: Record<string, unknown> }) {
        sent.push({ name: cmd.name, input: cmd.input })
        if (cmd.name === 'GetDistributionConfig') {
          return {
            ETag: 'etag-1',
            DistributionConfig: { Enabled: enabled, Comment: 'site' },
          }
        }
        return {}
      }
    },
  }
})
vi.mock('@aws-sdk/client-lambda', () => ({
  PutFunctionConcurrencyCommand: class {
    name = 'PutFunctionConcurrency'
    constructor(public input: Record<string, unknown>) {}
  },
  LambdaClient: class {
    async send(cmd: { name: string; input: Record<string, unknown> }) {
      sent.push({ name: cmd.name, input: cmd.input })
      return {}
    }
  },
}))

const { handler } = await import('./kill-switch')

const alarm = (state: string) => ({
  Records: [
    {
      Sns: {
        Message: JSON.stringify({
          AlarmName: 'requests-hour',
          NewStateValue: state,
        }),
      },
    },
  ],
})

describe('kill switch', () => {
  beforeEach(() => {
    sent.length = 0
    enabled = true
    process.env.DISTRIBUTION_ID = 'E123'
    process.env.SERVER_FUNCTION = 'site-server'
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('stops the server, then disables the distribution', async () => {
    await handler(alarm('ALARM'))
    expect(sent.map((call) => call.name)).toEqual([
      'PutFunctionConcurrency',
      'GetDistributionConfig',
      'UpdateDistribution',
    ])
    expect(sent[0]!.input).toEqual({
      FunctionName: 'site-server',
      ReservedConcurrentExecutions: 0,
    })
    expect(sent[2]!.input).toEqual({
      Id: 'E123',
      IfMatch: 'etag-1',
      DistributionConfig: { Enabled: false, Comment: 'site' },
    })
  })

  it('ignores alarms going back to OK', async () => {
    await handler(alarm('OK'))
    expect(sent).toEqual([])
  })

  it('leaves an already disabled distribution alone', async () => {
    enabled = false
    await handler(alarm('ALARM'))
    expect(sent.map((call) => call.name)).toEqual([
      'PutFunctionConcurrency',
      'GetDistributionConfig',
    ])
  })
})
