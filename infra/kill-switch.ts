import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
} from '@aws-sdk/client-cloudfront'
import {
  LambdaClient,
  PutFunctionConcurrencyCommand,
} from '@aws-sdk/client-lambda'

/** The parts of an SNS event from a CloudWatch alarm that we read. */
interface AlarmEvent {
  Records: { Sns: { Message: string } }[]
}

const cloudfront = new CloudFrontClient({})
const lambda = new LambdaClient({})

/**
 * Takes the site offline when a traffic alarm fires, so a flood of
 * requests can't run up a bill. The server stops at once (no capacity
 * left), then the CloudFront distribution is disabled.
 *
 * To bring the site back, re-run the latest deploy: it restores both.
 */
export async function handler(event: AlarmEvent): Promise<void> {
  const alarms = event.Records.map(
    (record) =>
      JSON.parse(record.Sns.Message) as {
        AlarmName?: string
        NewStateValue?: string
      },
  ).filter((alarm) => alarm.NewStateValue === 'ALARM')
  if (!alarms.length) return

  const distributionId = process.env.DISTRIBUTION_ID!
  const serverFunction = process.env.SERVER_FUNCTION!

  await lambda.send(
    new PutFunctionConcurrencyCommand({
      FunctionName: serverFunction,
      ReservedConcurrentExecutions: 0,
    }),
  )

  const { DistributionConfig: config, ETag } = await cloudfront.send(
    new GetDistributionConfigCommand({ Id: distributionId }),
  )
  if (config?.Enabled) {
    await cloudfront.send(
      new UpdateDistributionCommand({
        Id: distributionId,
        IfMatch: ETag,
        DistributionConfig: { ...config, Enabled: false },
      }),
    )
  }

  console.log(
    JSON.stringify({
      level: 'warn',
      event: 'kill_switch.tripped',
      alarms: alarms.map((alarm) => alarm.AlarmName ?? null),
    }),
  )
}
