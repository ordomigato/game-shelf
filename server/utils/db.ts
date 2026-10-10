import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { Resource } from 'sst'
import * as schema from '../db/schema'
import { recordTiming } from './request-timing'

let instance: ReturnType<typeof createDb> | undefined

function createDb() {
  // Neon's HTTP driver makes one fetch per query (or batch), so timing the
  // fetch times the query, for the request's log line.
  neonConfig.fetchFunction = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const started = performance.now()
    try {
      return await fetch(input, init)
    } finally {
      recordTiming('db', performance.now() - started)
    }
  }
  return drizzle({ client: neon(Resource.DatabaseUrl.value), schema })
}

/**
 * Drizzle client over Neon's HTTP driver, created on first use and reused
 * across warm Lambda invocations. The HTTP driver has no interactive
 * transactions. Use `db.batch([...])` for writes that must succeed together.
 */
export function useDb() {
  instance ??= createDb()
  return instance
}
