import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { Resource } from 'sst'
import * as schema from '../db/schema'

let instance: ReturnType<typeof createDb> | undefined

function createDb() {
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
