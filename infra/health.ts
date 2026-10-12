/**
 * What the daily health check measures, and when each number is worth an
 * email. The site is for its owner and a few friends, so anything past
 * that is a nudge, long before the kill switch would step in.
 */
export const LIMITS = {
  /** Neon's free plan stops writes at 0.5 GB. */
  databaseBytes: 400 * 1024 * 1024,
  /** The owner plus about ten friends. */
  users: 15,
  newUsersPerDay: 5,
  /** A handful of people browsing is a few hundred. */
  requestsPerDay: 3000,
}

export interface HealthReport {
  /** Null when the database couldn't be reached. */
  databaseBytes: number | null
  databaseError: string | null
  /** Accounts in Cognito, signed in or not. */
  users: number
  /** GameShelf users created in the last 24 hours. */
  newUsers: number | null
  /** CloudFront requests in the last 24 hours. */
  requests: number
  /** The home page's status, or null when it didn't answer at all. */
  siteStatus: number | null
}

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`

/** Problems worth an email, in plain words. Empty when all is well. */
export function problems(report: HealthReport): string[] {
  const found: string[] = []
  if (report.databaseBytes === null) {
    found.push(
      `The database didn't answer: ${report.databaseError ?? 'unknown error'}. Neon may be down or out of compute hours for the month.`,
    )
  } else if (report.databaseBytes > LIMITS.databaseBytes) {
    found.push(
      `The database is ${mb(report.databaseBytes)} of Neon's free 512 MB. Saving stops when it's full.`,
    )
  }
  if (report.users > LIMITS.users) {
    found.push(
      `There are ${report.users} accounts, more than the ${LIMITS.users} expected.`,
    )
  }
  if (report.newUsers !== null && report.newUsers > LIMITS.newUsersPerDay) {
    found.push(`${report.newUsers} people signed up in the last day.`)
  }
  if (report.requests > LIMITS.requestsPerDay) {
    found.push(
      `The site got ${report.requests} requests in the last day, more than a few people browsing.`,
    )
  }
  if (report.siteStatus !== 200) {
    found.push(
      report.siteStatus === null
        ? "The site didn't answer at all. If the kill switch fired, re-run the latest deploy to bring it back."
        : `The home page answered with ${report.siteStatus} instead of 200.`,
    )
  }
  return found
}

/** The numbers, for the weekly all-clear and the end of every alert. */
export function summary(report: HealthReport): string {
  return [
    `Database: ${report.databaseBytes === null ? 'not reachable' : mb(report.databaseBytes)}`,
    `Accounts: ${report.users} (${report.newUsers ?? '?'} new in the last day)`,
    `Requests in the last day: ${report.requests}`,
    `Home page: ${report.siteStatus ?? 'no answer'}`,
  ].join('\n')
}
