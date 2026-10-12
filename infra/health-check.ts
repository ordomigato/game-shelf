import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from '@aws-sdk/client-cloudwatch'
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'
import { neon } from '@neondatabase/serverless'
import { Resource } from 'sst'
import { type HealthReport, problems, summary } from './health'

/**
 * Runs once a day. Emails the owner when something needs a look (database
 * down or filling up, more people than expected, unusual traffic, the site
 * not answering), and on Mondays sends the numbers either way, so silence
 * means the check is still running and all is well.
 */
export async function handler(): Promise<void> {
  const report = await measure()
  const found = problems(report)
  const monday = new Date().getUTCDay() === 1
  if (!found.length && !monday) return

  const subject = found.length
    ? `ThisPlayShelf: ${found.length === 1 ? 'one thing needs' : `${found.length} things need`} a look`
    : 'ThisPlayShelf weekly: all good'
  const message = [
    ...found.map((problem) => `- ${problem}`),
    '',
    summary(report),
  ]
    .join('\n')
    .trim()
  await new SNSClient({}).send(
    new PublishCommand({
      TopicArn: process.env.ALERT_TOPIC_ARN!,
      Subject: subject,
      Message: message,
    }),
  )
}

async function measure(): Promise<HealthReport> {
  const [database, users, requests, siteStatus] = await Promise.all([
    measureDatabase(),
    countAccounts(),
    countRequests(),
    homePageStatus(),
  ])
  return { ...database, users, requests, siteStatus }
}

async function measureDatabase(): Promise<
  Pick<HealthReport, 'databaseBytes' | 'databaseError' | 'newUsers'>
> {
  try {
    const sql = neon(Resource.DatabaseUrl.value)
    const [size] =
      await sql`select pg_database_size(current_database())::bigint as bytes`
    const [fresh] =
      await sql`select count(*)::int as n from users where created_at > now() - interval '1 day'`
    return {
      databaseBytes: Number(size!.bytes),
      databaseError: null,
      newUsers: Number(fresh!.n),
    }
  } catch (error) {
    return {
      databaseBytes: null,
      databaseError: error instanceof Error ? error.message : String(error),
      newUsers: null,
    }
  }
}

async function countAccounts(): Promise<number> {
  const { UserPool } = await new CognitoIdentityProviderClient({}).send(
    new DescribeUserPoolCommand({ UserPoolId: Resource.Users.id }),
  )
  return UserPool?.EstimatedNumberOfUsers ?? 0
}

async function countRequests(): Promise<number> {
  const end = new Date()
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
  const { Datapoints } = await new CloudWatchClient({}).send(
    new GetMetricStatisticsCommand({
      Namespace: 'AWS/CloudFront',
      MetricName: 'Requests',
      Dimensions: [
        { Name: 'DistributionId', Value: process.env.DISTRIBUTION_ID! },
        { Name: 'Region', Value: 'Global' },
      ],
      StartTime: start,
      EndTime: end,
      Period: 86_400,
      Statistics: ['Sum'],
    }),
  )
  return Datapoints?.reduce((total, point) => total + (point.Sum ?? 0), 0) ?? 0
}

async function homePageStatus(): Promise<number | null> {
  try {
    const response = await fetch(process.env.SITE_URL!, {
      signal: AbortSignal.timeout(10_000),
    })
    return response.status
  } catch {
    return null
  }
}
