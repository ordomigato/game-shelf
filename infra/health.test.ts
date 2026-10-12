import { describe, expect, it } from 'vitest'
import { type HealthReport, LIMITS, problems, summary } from './health'

const healthy: HealthReport = {
  databaseBytes: 12 * 1024 * 1024,
  databaseError: null,
  users: 4,
  newUsers: 1,
  requests: 240,
  siteStatus: 200,
}

describe('problems', () => {
  it('finds nothing on a normal day', () => {
    expect(problems(healthy)).toEqual([])
  })

  it('reports the database not answering', () => {
    expect(
      problems({ ...healthy, databaseBytes: null, databaseError: 'timeout' }),
    ).toEqual([
      "The database didn't answer: timeout. Neon may be down or out of compute hours for the month.",
    ])
  })

  it('reports the database filling up', () => {
    const [problem] = problems({
      ...healthy,
      databaseBytes: LIMITS.databaseBytes + 1,
    })
    expect(problem).toContain("400 MB of Neon's free 512 MB")
  })

  it('reports more people than expected', () => {
    expect(problems({ ...healthy, users: 16, newUsers: 6 })).toEqual([
      'There are 16 accounts, more than the 15 expected.',
      '6 people signed up in the last day.',
    ])
  })

  it('reports unusual traffic', () => {
    expect(problems({ ...healthy, requests: 3001 })).toEqual([
      'The site got 3001 requests in the last day, more than a few people browsing.',
    ])
  })

  it('reports the site not answering, with how to recover', () => {
    expect(problems({ ...healthy, siteStatus: null })[0]).toContain(
      're-run the latest deploy',
    )
    expect(problems({ ...healthy, siteStatus: 503 })).toEqual([
      'The home page answered with 503 instead of 200.',
    ])
  })
})

describe('summary', () => {
  it('lists the numbers', () => {
    expect(summary(healthy)).toBe(
      [
        'Database: 12 MB',
        'Accounts: 4 (1 new in the last day)',
        'Requests in the last day: 240',
        'Home page: 200',
      ].join('\n'),
    )
  })
})
